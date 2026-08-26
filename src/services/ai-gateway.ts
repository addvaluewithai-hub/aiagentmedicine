import type {
  AgentCorrectableDoseContext,
  AgentDoseContext,
  AgentDoseResponse,
  AgentHistoryMessage,
  AgentMedicationPlanContext,
  AgentPendingConfirmation
} from '@/agent/agent-dose-action-schema';
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

type AudioMimeType = 'audio/m4a' | 'audio/mp4' | 'audio/aac' | 'audio/webm' | 'audio/mpeg' | 'audio/mp3';

type TranscribeAudioResponse = {
  ok: true;
  transcript: string;
};

type AgentApiResponse = AgentDoseResponse & { ok: true };

async function parseApiResponse<T extends { ok: true }>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as T | { ok: false; error?: string } | null;

  if (!response.ok || !payload?.ok) {
    const message = payload && 'error' in payload && payload.error
      ? payload.error
      : `request-failed-${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export async function extractMedication(input: ExtractMedicationInput): Promise<ExtractMedicationResponse> {
  const response = await fetch('/api/extract-medication', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  return parseApiResponse<ExtractMedicationResponse>(response);
}

export async function transcribeAudio(input: {
  audioBase64: string;
  mimeType: AudioMimeType;
}): Promise<TranscribeAudioResponse> {
  const response = await fetch('/api/transcribe-audio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  return parseApiResponse<TranscribeAudioResponse>(response);
}

export async function runMedicationAgent(input: {
  text: string;
  doses: AgentDoseContext[];
  correctableDoses: AgentCorrectableDoseContext[];
  plans: AgentMedicationPlanContext[];
  history: AgentHistoryMessage[];
  pendingConfirmation: AgentPendingConfirmation | null;
  timeZone: string;
}): Promise<AgentApiResponse> {
  const response = await fetch('/api/agent-dose-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });

  return parseApiResponse<AgentApiResponse>(response);
}
