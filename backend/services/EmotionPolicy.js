export const EMOTIONS = {
  NEUTRAL: 'neutral',
  WARM: 'warm',
  HAPPY: 'happy',
  CURIOUS: 'curious',
  THINKING: 'thinking',
  APOLOGETIC: 'apologetic',
  CONCERNED: 'concerned'
};

export class EmotionPolicy {
  decide({ message = '', reply = '', memory = {}, rag = {}, workflow = {}, error = null } = {}) {
    const text = `${message}\n${reply}`.toLowerCase();

    if (error || /抱歉|失败|错误|不可用|超时|没有配置|not_configured/i.test(text)) {
      return { emotion: EMOTIONS.APOLOGETIC, intensity: 0.62, reason: 'error_or_fallback' };
    }
    if (memory?.longTerm?.count > 0 || memory?.longTermWrite?.stored) {
      return { emotion: EMOTIONS.WARM, intensity: 0.72, reason: 'memory_context' };
    }
    if (rag?.used || rag?.passages?.length) {
      return { emotion: EMOTIONS.CURIOUS, intensity: 0.58, reason: 'rag_context' };
    }
    if (workflow?.used || workflow?.status === 'not_configured') {
      return { emotion: EMOTIONS.THINKING, intensity: 0.5, reason: 'workflow_context' };
    }
    if (/喜欢|太好了|开心|棒|谢谢|哈哈|嘿嘿|✨|！/.test(text)) {
      return { emotion: EMOTIONS.HAPPY, intensity: 0.68, reason: 'positive_text' };
    }
    if (/为什么|怎么|如何|吗|？|\?/.test(text)) {
      return { emotion: EMOTIONS.CURIOUS, intensity: 0.52, reason: 'question_text' };
    }
    return { emotion: EMOTIONS.WARM, intensity: 0.48, reason: 'default_warm' };
  }
}
