import { ProviderStatusService } from '../services/ProviderStatusService.js';
import { ttsProviderRegistry } from '../services/tts/TTSRuntime.js';
import { sendOk } from '../utils/response.js';

const providerStatusService = new ProviderStatusService({ ttsRegistry: ttsProviderRegistry });

export async function handleProviders(_req, res) {
  sendOk(res, 200, await providerStatusService.getStatus());
}
