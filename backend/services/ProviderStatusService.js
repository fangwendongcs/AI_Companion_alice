import {
  providerBaseUrlEnv,
  providerBaseUrls,
  providerDefaultModels,
  providerKeyEnv
} from '../config/serverConfig.js';

const realProviders = ['openai', 'qwen', 'deepseek', 'custom'];

export class ProviderStatusService {
  getStatus() {
    return {
      llm: [
        {
          provider: 'stub',
          configured: true,
          defaultModel: providerDefaultModels.stub,
          mode: 'demo',
          requiresKey: false,
          status: 'ready'
        },
        ...realProviders.map((provider) => this.getRealProviderStatus(provider))
      ]
    };
  }

  getRealProviderStatus(provider) {
    const hasKey = Boolean(resolveApiKey(provider));
    const hasBaseUrl = Boolean(resolveBaseUrl(provider));
    return {
      provider,
      configured: hasKey && hasBaseUrl,
      defaultModel: providerDefaultModels[provider] || '',
      mode: 'real',
      requiresKey: true,
      status: getStatus({ hasKey, hasBaseUrl })
    };
  }
}

function resolveApiKey(provider) {
  const envName = providerKeyEnv[provider];
  return ((envName && process.env[envName]) || process.env.LLM_API_KEY || '').trim();
}

function resolveBaseUrl(provider) {
  const envName = providerBaseUrlEnv[provider];
  return ((envName && process.env[envName]) || providerBaseUrls[provider] || '').trim();
}

function getStatus({ hasKey, hasBaseUrl }) {
  if (hasKey && hasBaseUrl) return 'ready';
  if (!hasKey && !hasBaseUrl) return 'missing_key_and_base_url';
  if (!hasKey) return 'missing_key';
  return 'missing_base_url';
}
