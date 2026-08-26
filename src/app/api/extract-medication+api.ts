import { z } from 'zod';

import { MedicationDraftSchema } from '@/ai/medication-draft-schema';
import { routeModel } from '@/server/ai/model-router';

const RequestSchema = z.object({
  text: z.string().trim().max(4_000).optional(),
  imageBase64: z.string().max(12_000_000).optional(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional()
}).refine((value) => Boolean(value.text || value.imageBase64), {
  message: 'Text or image is required.'
}).refine((value) => !value.imageBase64 || Boolean(value.mimeType), {
  message: 'mimeType is required with imageBase64.'
});

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedRequest = RequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json({ ok: false, error: 'invalid-request' }, { status: 400 });
  }

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (parsedRequest.data.imageBase64 && parsedRequest.data.mimeType) {
    parts.push({ inlineData: { mimeType: parsedRequest.data.mimeType, data: parsedRequest.data.imageBase64 } });
  }
  parts.push({
    text: parsedRequest.data.text || 'Extract the medication information visible in this image.'
  });

  const system = `You extract medication information supplied by the user. You are not a prescriber. Never guess unreadable or missing clinical instructions. Use null for unknown values and list materially uncertain fields in uncertainFields. Preserve medication names and units as written. Return JSON only with shape: {"medications":[{"name":string|null,"strength":string|null,"form":string|null,"route":string|null,"doseAmount":string|null,"frequency":string|null,"mealRelation":string|null,"timingText":string|null,"uncertainFields":["name"|"strength"|"form"|"route"|"doseAmount"|"frequency"|"mealRelation"|"timingText"],"notes":string|null}]}.`;

  const routed = await routeModel({
    apiKey: process.env.AI_API,
    system,
    parts,
    task: 'medication-extraction',
    maxOutputTokens: 1_200
  });

  if (!routed.ok) {
    return Response.json({ ok: false, error: routed.error }, { status: 503 });
  }

  const validated = MedicationDraftSchema.safeParse(extractJson(routed.text));
  if (!validated.success) {
    return Response.json({ ok: false, error: 'invalid-model-output' }, { status: 502 });
  }

  return Response.json({
    ok: true,
    draft: validated.data,
    diagnostics: {
      model: routed.model,
      fallbackCount: routed.fallbackCount,
      latencyMs: routed.latencyMs
    }
  });
}
