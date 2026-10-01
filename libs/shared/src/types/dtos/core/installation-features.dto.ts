import type { ConnectorProvider } from '../../../entities/core';

/**
 * Voice note transcription readiness:
 * - `unsupported-by-ai-provider`: the selected AI provider (Claude) has no
 *   audio input and no alternative transcription provider is configured.
 * - `not-configured`: the transcription provider has no API key.
 */
export type VoiceTranscriptionStatus =
  | 'available'
  | 'unsupported-by-ai-provider'
  | 'not-configured';

/** Effective installation capabilities; credentials and filesystem paths are never exposed. */
export type InstallationFeaturesDto = {
  manualFitImport: boolean;
  manualGarminSync: boolean;
  voiceTranscription: VoiceTranscriptionStatus;
};

/** Local OAuth readiness only; credentials are never included. */
export type ProviderConfigurationDto = Partial<
  Record<ConnectorProvider, boolean>
>;
