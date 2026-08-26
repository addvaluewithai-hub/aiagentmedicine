import { z } from 'zod';

import { routeModel } from '@/server/ai/model-router';

const AudioRequestSchema = z.object({
  audioBase64: z.string().min(1).max(12_000_000),
  mimeType: z.enum(['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/mpeg', 'audio/mp3'])
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = AudioRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  const routed = await routeModel({
    apiKey: process.env.AI_API,
    models: ['gemini-3.5-flash-lite'],
    task: 'voice-transcription',
    system: `You are a speech-to-text component for a medication reminder app. Transcribe exactly what the user says in the language they speak. Preserve medication names, strengths, units, numbers, times, negatives, and corrections carefully. Do not answer the user, summarize, translate, infer missing words, or give medical advice. Return transcript text only.`,
    parts: [
      { inlineData: { mimeType: parsed.data.mimeType, data: parsed.data.audioBase64 } },
      { text: 'Transcribe this medication-related voice message verbatim.' }
    ],
    maxOutputTokens: 700,
    attemptTimeoutMs: 8_000,
    overallTimeoutMs: 9_000
  });

  if (!routed.ok) {
    return Response.json({ ok: false, error: routed.error }, { status: 503 });
  }

  const transcript = routed.text.trim();
  if (!transcript) {
    return Response.json({ ok: false, error: 'empty-transcript' }, { status: 502 });
  }

  return Response.json({
    ok: true,
    transcript,
    diagnostics: {
      model: routed.model,
      latencyMs: routed.latencyMs
    }
  });
}
