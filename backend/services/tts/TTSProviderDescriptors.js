const field = (id, label, {
  type = 'text',
  secret = false,
  placeholder = '',
  help = '',
  defaultValue = undefined
} = {}) => Object.freeze({
  id,
  label,
  type,
  secret,
  placeholder,
  help,
  ...(defaultValue !== undefined ? { defaultValue } : {})
});

const descriptors = [
  {
    id: 'mock',
    displayName: '测试静音',
    technicalName: 'Mock TTS',
    type: 'local',
    selectable: false,
    requiredFields: [],
    optionalFields: [],
    capabilities: {
      supportsStreaming: false,
      supportsVoiceClone: false,
      supportsEmotion: false
    },
    models: ['mock'],
    voices: ['mock-silence']
  },
  {
    id: 'cosyvoice',
    displayName: '默认语音',
    technicalName: 'CosyVoice2 Local',
    type: 'local',
    selectable: true,
    requiredFields: [],
    optionalFields: [],
    capabilities: {
      supportsStreaming: true,
      supportsVoiceClone: true,
      supportsEmotion: true
    },
    models: ['iic/CosyVoice2-0.5B'],
    voices: ['中文女']
  },
  {
    id: 'voxcpm2',
    displayName: '本地语音 · VoxCPM2（实验）',
    technicalName: 'VoxCPM2 Local MPS',
    type: 'local',
    selectable: true,
    requiredFields: [],
    optionalFields: [],
    capabilities: {
      supportsStreaming: true,
      supportsVoiceClone: true,
      supportsEmotion: true
    },
    models: ['openbmb/VoxCPM2'],
    voices: ['default']
  },
  {
    id: 'qwen3_tts',
    displayName: '云端语音 · Qwen3-TTS',
    technicalName: 'Qwen3-TTS via DashScope',
    type: 'remote',
    selectable: true,
    requiredFields: [
      field('apiKey', 'API Key', { type: 'password', secret: true, placeholder: '从阿里云 DashScope 控制台获取' }),
      field('model', 'Model', { placeholder: 'qwen3-tts-flash' }),
      field('voice', 'Voice', { placeholder: 'Cherry' })
    ],
    optionalFields: [
      field('baseUrl', 'API URL', { type: 'url', placeholder: 'https://dashscope.aliyuncs.com/api/v1' }),
      field('languageType', '语言', { placeholder: 'Chinese', defaultValue: 'Chinese' })
    ],
    capabilities: {
      supportsStreaming: true,
      supportsVoiceClone: true,
      supportsEmotion: true
    },
    models: ['qwen3-tts-flash'],
    voices: ['Cherry']
  },
  {
    id: 'fish_audio',
    displayName: '云端语音 · Fish Audio',
    technicalName: 'Fish Audio Cloud',
    type: 'remote',
    selectable: true,
    requiredFields: [
      field('apiKey', 'API Key', { type: 'password', secret: true, placeholder: '从 Fish Audio 控制台获取' }),
      field('model', 'Model', { placeholder: 's2.1-pro-free' }),
      field('voice', 'Voice / Reference ID', { placeholder: 'Fish Audio 声线 ID' })
    ],
    optionalFields: [
      field('baseUrl', 'API URL', { type: 'url', placeholder: 'https://api.fish.audio' }),
      field('latencyMode', '延迟模式', { placeholder: 'balanced', defaultValue: 'balanced' })
    ],
    capabilities: {
      supportsStreaming: true,
      supportsVoiceClone: true,
      supportsEmotion: false
    },
    models: ['s2.1-pro-free'],
    voices: []
  },
  {
    id: 'self_hosted',
    displayName: '自建语音服务',
    technicalName: 'Self-hosted OpenAI-compatible TTS',
    type: 'selfHosted',
    selectable: true,
    requiredFields: [
      field('serverUrl', 'Server URL', { type: 'url', placeholder: 'http://127.0.0.1:8000' }),
      field('model', 'Model', { placeholder: '部署服务暴露的模型名' }),
      field('voice', 'Voice', { placeholder: '部署服务暴露的声线名' })
    ],
    optionalFields: [
      field('apiKey', '访问 Key（可选）', { type: 'password', secret: true, placeholder: '无鉴权服务请留空' }),
      field('apiPath', 'API Path', { placeholder: '/v1/audio/speech', defaultValue: '/v1/audio/speech' }),
      field('outputFormat', '音频格式', { placeholder: 'wav', defaultValue: 'wav' }),
      field('sampleRate', '采样率', { type: 'number', placeholder: '24000', defaultValue: 24000 })
    ],
    capabilities: {
      supportsStreaming: false,
      supportsVoiceClone: false,
      supportsEmotion: false
    },
    models: [],
    voices: []
  }
].map((descriptor) => Object.freeze({
  ...descriptor,
  requiredFields: Object.freeze([...descriptor.requiredFields]),
  optionalFields: Object.freeze([...descriptor.optionalFields]),
  capabilities: Object.freeze({ ...descriptor.capabilities }),
  models: Object.freeze([...descriptor.models]),
  voices: Object.freeze([...descriptor.voices])
}));

const descriptorMap = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));

export const DEFAULT_LOCAL_TTS_PROVIDER_ID = 'cosyvoice';

export function getTTSProviderDescriptor(providerId = '') {
  return descriptorMap.get(normalizeProviderId(providerId)) || null;
}

export function listTTSProviderDescriptors({ selectableOnly = false } = {}) {
  return descriptors
    .filter((descriptor) => !selectableOnly || descriptor.selectable !== false)
    .map(cloneDescriptor);
}

export function getTTSProviderFieldMap(providerId = '') {
  const descriptor = getTTSProviderDescriptor(providerId);
  if (!descriptor) return new Map();
  return new Map(
    [...descriptor.requiredFields, ...descriptor.optionalFields]
      .map((item) => [item.id, item])
  );
}

export function cloneDescriptor(descriptor) {
  if (!descriptor) return null;
  return {
    ...descriptor,
    requiredFields: descriptor.requiredFields.map(toPublicField),
    optionalFields: descriptor.optionalFields.map(toPublicField),
    capabilities: { ...descriptor.capabilities },
    models: [...descriptor.models],
    voices: [...descriptor.voices]
  };
}

function toPublicField({ secret: _secret, ...fieldDefinition }) {
  return { ...fieldDefinition };
}

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase();
}
