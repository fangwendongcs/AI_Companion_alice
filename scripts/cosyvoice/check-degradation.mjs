import { TTSOrchestrator } from '../../backend/services/tts/TTSOrchestrator.js';
import { DialogueOrchestrationService } from '../../backend/services/DialogueOrchestrationService.js';

const tts = await new TTSOrchestrator().synthesize({
  provider: 'cosyvoice',
  text: '服务停止后的降级验证',
  voiceId: process.env.COSYVOICE_VOICE_ID || '中文女',
  locale: 'zh-CN'
});

if (tts.tts_status === 'ok') {
  console.error('[check-cosyvoice-degradation] expected CosyVoice to be unavailable after stop, but got ok.');
  process.exit(1);
}

const dialogue = await new DialogueOrchestrationService().run({
  message: '服务停止后还能正常回复吗？',
  provider: 'stub',
  model: 'stub-local-demo',
  options: {
    useMemory: false,
    useRag: false,
    useWorkflow: false
  }
});

const reply = dialogue?.reply || dialogue?.reply_text || '';
if (!reply) {
  console.error('[check-cosyvoice-degradation] dialogue did not return text.');
  process.exit(1);
}

console.log(JSON.stringify({
  ttsStatus: tts.tts_status,
  ttsErrorCode: tts.error?.code || null,
  dialogueMode: dialogue.meta?.mode || null,
  dialogueReplyPreview: reply.slice(0, 40)
}, null, 2));
