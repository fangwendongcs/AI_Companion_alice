export const EMOTIONS = {
  NEUTRAL: 'neutral',
  WARM: 'warm',
  HAPPY: 'happy',
  CURIOUS: 'curious',
  THINKING: 'thinking',
  APOLOGETIC: 'apologetic',
  CONCERNED: 'concerned'
};

const POSITIVE_TEXT_PATTERN = /(?:太好了|开心|真棒|谢谢|哈哈|嘿嘿|✨|(?:^|[，,。！!；;\s])(?:我)?(?:很|挺|特别|真的)?喜欢)/;

export class EmotionPolicy {
  decide({ message = '', reply = '', memory = {}, rag = {}, workflow = {}, error = null } = {}) {
    const text = `${message}\n${reply}`.toLowerCase();
    const userText = String(message || '').toLowerCase();

    if (error || /抱歉|失败|错误|不可用|超时|没有配置|not_configured/i.test(text)) {
      return { emotion: EMOTIONS.APOLOGETIC, intensity: 0.62, reason: 'error_or_fallback' };
    }
    if (/很累|累了|疲惫|难受|担心|焦虑|害怕|有点空|空落落|失落|低落|压力|不安|沮丧|难过|不开心|没劲|没力气|想安静|撑不住|好烦|很烦|烦死|心烦|抱怨|吐槽|憋屈|委屈/.test(userText)) {
      return { emotion: EMOTIONS.CONCERNED, intensity: 0.58, reason: 'user_distress' };
    }
    if (/不用安慰|不要安慰|别安慰|只是随口|就是随口|不想聊这个|算了.*(?:没说|没提|没问)|别老问|不要再问/.test(userText)) {
      return { emotion: EMOTIONS.WARM, intensity: 0.42, reason: 'user_low_intervention' };
    }
    if (POSITIVE_TEXT_PATTERN.test(userText)) {
      return { emotion: EMOTIONS.HAPPY, intensity: 0.68, reason: 'positive_text' };
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
    if (POSITIVE_TEXT_PATTERN.test(text)) {
      return { emotion: EMOTIONS.HAPPY, intensity: 0.68, reason: 'positive_text' };
    }
    if (/为什么|怎么|如何|吗|？|\?/.test(text)) {
      return { emotion: EMOTIONS.CURIOUS, intensity: 0.52, reason: 'question_text' };
    }
    return { emotion: EMOTIONS.WARM, intensity: 0.48, reason: 'default_warm' };
  }
}
