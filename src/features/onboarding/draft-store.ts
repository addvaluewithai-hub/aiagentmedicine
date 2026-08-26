import type { MedicationDraft } from '@/ai/medication-draft-schema';

let currentDraft: MedicationDraft | null = null;

export function setOnboardingDraft(draft: MedicationDraft) {
  currentDraft = draft;
}

export function getOnboardingDraft() {
  return currentDraft;
}

export function clearOnboardingDraft() {
  currentDraft = null;
}
