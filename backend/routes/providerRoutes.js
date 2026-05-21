import { ProviderStatusService } from '../services/ProviderStatusService.js';
import { sendOk } from '../utils/response.js';

const providerStatusService = new ProviderStatusService();

export function handleProviders(_req, res) {
  sendOk(res, 200, providerStatusService.getStatus());
}
