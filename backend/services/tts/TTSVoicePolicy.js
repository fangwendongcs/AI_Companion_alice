const emotionInstruction = {
  neutral: '保持自然、清晰、不过度表演。',
  warm: '语气温暖、亲近，像稳定陪伴的伙伴。',
  happy: '语气轻快、明亮，但不要夸张尖锐。',
  curious: '语气带一点好奇和鼓励。',
  thinking: '语速稍慢，像正在认真思考。',
  apologetic: '语气柔和、抱歉、安抚。',
  concerned: '语气关心、放轻，不制造压力。',
  sad: '语气低一点、温柔一点。',
  angry: '保持克制，不要攻击性表达。',
  surprised: '轻微惊讶，但保持清晰。'
};

const toneInstruction = {
  calm: '整体平稳。',
  playful: '带一点活泼感。',
  gentle: '更轻柔、更陪伴。',
  concise: '干净利落，不拖长。',
  encouraging: '更鼓励、更支持。'
};

const higgsEmotionTokens = {
  neutral: '<|emotion:neutral|>',
  warm: '<|emotion:warm|>',
  happy: '<|emotion:happy|>',
  curious: '<|emotion:curious|>',
  thinking: '<|emotion:thinking|>',
  apologetic: '<|emotion:apologetic|>',
  concerned: '<|emotion:concerned|>',
  sad: '<|emotion:sad|>',
  angry: '<|emotion:angry|>',
  surprised: '<|emotion:surprised|>'
};

const higgsToneTokens = {
  calm: '<|tone:calm|>',
  playful: '<|tone:playful|>',
  gentle: '<|tone:gentle|>',
  concise: '<|tone:concise|>',
  encouraging: '<|tone:encouraging|>'
};

export function mapAliceTTSStyle({
  emotion = 'neutral',
  tone = 'calm',
  prosody = {},
  locale = 'zh-CN',
  provider = 'mock',
  instructions = ''
} = {}) {
  const normalizedEmotion = normalizeKey(emotion, 'neutral');
  const normalizedTone = normalizeKey(tone, 'calm');
  const rate = Number.isFinite(Number(prosody.rate)) ? Number(prosody.rate) : 1;
  const pitch = Number.isFinite(Number(prosody.pitch)) ? Number(prosody.pitch) : 1;
  const providerPrefix = provider === 'higgs'
    ? '请按控制 token 的语义生成自然语音。'
    : '请生成适合 AI 数字伙伴 Alice 的中文语音。';

  const semanticInstruction = [
    providerPrefix,
    `语言：${locale || 'zh-CN'}。`,
    emotionInstruction[normalizedEmotion] || emotionInstruction.neutral,
    toneInstruction[normalizedTone] || toneInstruction.calm,
    `语速倍率约 ${rate.toFixed(2)}，音高倍率约 ${pitch.toFixed(2)}。`,
    instructions
  ].filter(Boolean).join(' ');

  const inlineTokens = [
    higgsEmotionTokens[normalizedEmotion] || higgsEmotionTokens.neutral,
    higgsToneTokens[normalizedTone] || higgsToneTokens.calm
  ].join('');

  return {
    emotion: normalizedEmotion,
    tone: normalizedTone,
    instruction: semanticInstruction,
    prompt: semanticInstruction,
    inlineTokens,
    prosody: {
      rate,
      pitch,
      volume: Number.isFinite(Number(prosody.volume)) ? Number(prosody.volume) : 1
    }
  };
}

function normalizeKey(value, fallback) {
  return String(value || fallback).trim().toLowerCase().replace(/[^a-z_]/g, '') || fallback;
}
