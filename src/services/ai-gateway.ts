import Constants from 'expo-constants';
import { Platform } from 'react-native';

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

function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  if (Platform.OS === 'web') return '';

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri}`;

  throw new Error('missing-api-base-url');
}

export async function extractMedication(input: ExtractMedicationInput): Promise<ExtractMedicationResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/extract-medication`, {
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
