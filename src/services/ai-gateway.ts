import type { MedicationDraft } from '@/ai/medication-draft-schema';

type ExtractMedicationInput = {
  text?: string;
  imageBase64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  existingDraft?: MedicationDraft;
};

type ExtractMedicationResponse = {
  ok: true;
  draft: MedicationDraft;
  assistantMessage: string;
};

export async function extractMedication(input: ExtractMedicationInput): Promise<ExtractMedicationResponse> {
  const response = await fetch('/api/extract-medication', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  const payload = await response.json().catch(() => null) as
    | ExtractMedicationResponse
    | { ok: false; error?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    const message = payload && 'error' in payload && payload.error
      ? payload.error
      : `request-failed-${response.status}`;
    throw new Error(message);
  }

  return payload;
}
