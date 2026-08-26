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

type TranscribeAudioInput = {
  audioBase64: string;
  mimeType: 'audio/m4a' | 'audio/mp4' | 'audio/aac' | 'audio/webm' | 'audio/mpeg' | 'audio/mp3';
};

type TranscribeAudioResponse = {
  ok: true;
  transcript: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as T | { ok: false; error?: string } | null;
  if (!response.ok || !payload || (typeof payload === 'object' && 'ok' in payload && payload.ok === false)) {
    const message = payload && typeof payload === 'object' && 'error' in payload && payload.error
      ? payload.error
      : `request-failed-${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function extractMedication(input: ExtractMedicationInput): Promise<ExtractMedicationResponse> {
  const response = await fetch('/api/extract-medication', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  return readJson<ExtractMedicationResponse>(response);
}

export async function transcribeMedicationAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResponse> {
  const response = await fetch('/api/transcribe-audio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  return readJson<TranscribeAudioResponse>(response);
}
