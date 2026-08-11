import {
  ttsConfigEncryptionKey,
  ttsConfigStoreDir
} from '../../config/serverConfig.js';
import { TTSOrchestrator } from './TTSOrchestrator.js';
import { TTSProviderConfigurationService } from './TTSProviderConfigurationService.js';
import { TTSProviderConfigStore } from './TTSProviderConfigStore.js';
import { createTTSProviderRegistry } from './TTSProviderRegistry.js';

export const ttsProviderConfigStore = new TTSProviderConfigStore({
  directory: ttsConfigStoreDir,
  encryptionKey: ttsConfigEncryptionKey
});

export const ttsProviderRegistry = createTTSProviderRegistry({
  configStore: ttsProviderConfigStore
});

export const ttsOrchestrator = new TTSOrchestrator({ registry: ttsProviderRegistry });

export const ttsProviderConfigurationService = new TTSProviderConfigurationService({
  registry: ttsProviderRegistry,
  configStore: ttsProviderConfigStore
});
