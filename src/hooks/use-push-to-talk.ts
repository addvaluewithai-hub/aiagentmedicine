import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useState } from 'react';

import { transcribeAudio } from '@/services/ai-gateway';

type SupportedAudioMime =
  | 'audio/m4a'
  | 'audio/mp4'
  | 'audio/aac'
  | 'audio/webm'
  | 'audio/mpeg'
  | 'audio/mp3';

export type PushToTalkResult =
  | { type: 'recording-started' }
  | { type: 'transcript'; transcript: string }
  | { type: 'permission-denied' }
  | { type: 'error'; message: string };

function normalizeAudioMime(mimeType: string | undefined, uri: string): SupportedAudioMime {
  if (
    mimeType === 'audio/m4a' ||
    mimeType === 'audio/mp4' ||
    mimeType === 'audio/aac' ||
    mimeType === 'audio/webm' ||
    mimeType === 'audio/mpeg' ||
    mimeType === 'audio/mp3'
  ) {
    return mimeType;
  }

  const normalizedUri = uri.toLowerCase();
  if (normalizedUri.endsWith('.webm')) return 'audio/webm';
  if (normalizedUri.endsWith('.aac')) return 'audio/aac';
  if (normalizedUri.endsWith('.mp3')) return 'audio/mpeg';
  if (normalizedUri.endsWith('.m4a')) return 'audio/m4a';
  return 'audio/mp4';
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : 'unknown-error';
}

export function usePushToTalk() {
  const audioRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const [isTranscribing, setIsTranscribing] = useState(false);

  async function toggle(): Promise<PushToTalkResult> {
    if (isTranscribing) {
      return { type: 'error', message: 'transcription-in-progress' };
    }

    if (recorderState.isRecording) {
      setIsTranscribing(true);
      try {
        await audioRecorder.stop();
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });

        const uri = audioRecorder.uri;
        if (!uri) throw new Error('recording-file-missing');

        const file = new File(uri);
        if (!file.size) throw new Error('recording-file-empty');
        if (file.size > 8_000_000) throw new Error('recording-too-large');

        const result = await transcribeAudio({
          audioBase64: await file.base64(),
          mimeType: normalizeAudioMime(file.type, uri)
        });

        const transcript = result.transcript.trim();
        if (!transcript) throw new Error('empty-transcript');
        return { type: 'transcript', transcript };
      } catch (cause) {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
        return { type: 'error', message: errorMessage(cause) };
      } finally {
        setIsTranscribing(false);
      }
    }

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      return { type: 'permission-denied' };
    }

    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      return { type: 'recording-started' };
    } catch (cause) {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
      return { type: 'error', message: errorMessage(cause) };
    }
  }

  return {
    isRecording: recorderState.isRecording,
    isTranscribing,
    recordingSeconds: Math.max(0, Math.ceil(recorderState.durationMillis / 1_000)),
    toggle
  };
}
