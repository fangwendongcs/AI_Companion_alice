import { ProviderStatusService } from '../services/ProviderStatusService.js';
import { sendOk } from '../utils/response.js';

const providerStatusService = new ProviderStatusService();

export async function handleProviders(_req, res) {
  sendOk(res, 200, await providerStatusService.getStatus());
}
