export const MODEL_CHAIN = [
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite'
] as const;

const RETRYABLE_STATUSES = new Set([404, 408, 409, 429, 500, 502, 503, 504]);
const DEADLINE_RESERVE_MS = 300;
const MIN_ATTEMPT_MS = 250;

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function deadlineSignal(timeoutMs: number, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const onAbort = () => controller.abort(parentSignal?.reason ?? 'parent-abort');
  parentSignal?.addEventListener('abort', onAbort, { once: true });

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onAbort);
    }
  };
}

export function computeAttemptTimeout(input: {
  attemptTimeoutMs: number;
  overallTimeoutMs: number;
  elapsedMs: number;
  remainingModels: number;
}) {
  const remainingOverallMs = Math.max(0, input.overallTimeoutMs - input.elapsedMs);
  if (remainingOverallMs <= DEADLINE_RESERVE_MS || input.remainingModels <= 0) return 0;
  const fairShareMs = Math.floor((remainingOverallMs - DEADLINE_RESERVE_MS) / input.remainingModels);
  return Math.max(MIN_ATTEMPT_MS, Math.min(input.attemptTimeoutMs, fairShareMs));
}

function extractText(payload: any) {
  return payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim() || '';
}

async function callModel(input: {
  apiKey: string;
  model: string;
  system: string;
  parts: GeminiPart[];
  maxOutputTokens: number;
  timeoutMs: number;
  signal: AbortSignal;
}) {
  const attempt = deadlineSignal(input.timeoutMs, input.signal);
  const startedAt = Date.now();

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: attempt.signal,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': input.apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: input.parts }],
        generationConfig: { maxOutputTokens: input.maxOutputTokens }
      })
    });

    const payload = await response.json().catch(() => ({}));
    const text = extractText(payload);
    return {
      ok: response.ok && Boolean(text),
      status: response.status,
      text,
      latencyMs: Date.now() - startedAt
    };
  } finally {
    attempt.dispose();
  }
}

export async function routeModel(input: {
  apiKey: string | undefined;
  system: string;
  parts: GeminiPart[];
  task: string;
  maxOutputTokens?: number;
  attemptTimeoutMs?: number;
  overallTimeoutMs?: number;
}) {
  if (!input.apiKey) return { ok: false as const, error: 'missing-ai-api', attempts: [] };

  const attemptTimeoutMs = input.attemptTimeoutMs ?? 5_000;
  const overallTimeoutMs = input.overallTimeoutMs ?? 14_000;
  const maxOutputTokens = input.maxOutputTokens ?? 800;
  const overall = deadlineSignal(overallTimeoutMs);
  const attempts: Array<{ model: string; status: number | string; latencyMs: number; ok: boolean }> = [];
  const startedAt = Date.now();

  try {
    for (let index = 0; index < MODEL_CHAIN.length; index += 1) {
      const model = MODEL_CHAIN[index];
      if (overall.signal.aborted) break;

      const timeoutMs = computeAttemptTimeout({
        attemptTimeoutMs,
        overallTimeoutMs,
        elapsedMs: Date.now() - startedAt,
        remainingModels: MODEL_CHAIN.length - index
      });
      if (timeoutMs <= 0) break;

      try {
        const result = await callModel({
          apiKey: input.apiKey,
          model,
          system: input.system,
          parts: input.parts,
          maxOutputTokens,
          timeoutMs,
          signal: overall.signal
        });

        attempts.push({ model, status: result.status, latencyMs: result.latencyMs, ok: result.ok });

        if (result.ok) {
          return {
            ok: true as const,
            model,
            text: result.text,
            task: input.task,
            latencyMs: Date.now() - startedAt,
            fallbackCount: attempts.length - 1,
            attempts
          };
        }

        if (!RETRYABLE_STATUSES.has(result.status)) {
          return { ok: false as const, error: 'provider-rejected-request', status: result.status, attempts };
        }
      } catch (error) {
        attempts.push({
          model,
          status: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network-error',
          latencyMs: 0,
          ok: false
        });
      }
    }
  } finally {
    overall.dispose();
  }

  return { ok: false as const, error: 'all-models-unavailable', attempts };
}
