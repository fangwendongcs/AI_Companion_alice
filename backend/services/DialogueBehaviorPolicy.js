const RECENT_USER_DIRECTIVE_LIMIT = 4;

const ADVICE_DENY_PATTERNS = [
  /(?:^|[，,。！!；;])\s*(?:请)?\s*(?:你|我)?\s*(?:先|暂时|现在)?\s*(?:别|不要|不用|不必|无需|不需要)\s*(?:再|急着|马上|总是|老是)?\s*(?:给|提|说|想|找|帮我想|帮我解决)?\s*(?:我)?\s*(?:出)?\s*(?:任何|什么|一些|些|点)?\s*(?:建议|意见|办法|方案|对策|主意)/i,
  /(?:^|[，,。！!；;])\s*(?:但|可|可是|就是)?\s*(?:我)?\s*(?:暂时|现在)?\s*(?:不想|不需要|不用|先不|别)\s*(?:解决|处理|想办法|找办法|分析)/i,
  /(?:^|[，,。！!；;])\s*(?:我)?\s*(?:只是|就是|只想|就想)\s*(?:想)?\s*(?:抱怨|吐槽|发发?牢骚|倾诉)/i,
  /(?:^|[，,。！!；;])\s*(?:你)?\s*(?:听着|听我说|听听)\s*(?:就行|就好|可以了)/i
];

const ADVICE_ALLOW_PATTERNS = [
  /(?:^|[，,。！!；;])\s*(?:现在|这次|接下来)?\s*(?:你)?\s*(?:可以|能不能|请|来)\s*(?:给|提|说)\s*(?:我)?\s*(?:一些|些|点|几个)?\s*(?:建议|意见|办法|方案|对策|主意)(?:了|吧|吗)?/i,
  /(?:^|[，,。！!；;])\s*(?:(?:我)?\s*(?:现在|这次)?|(?:现在|这次)\s*(?:我)?)\s*(?:想|愿意|可以)\s*(?:听|要)\s*(?:一些|些|点)?\s*(?:建议|意见|办法|方案|对策|主意)/i
];

const QUESTION_DENY_PATTERNS = [
  /(?:你)?\s*(?:别|不要|不用|不必)\s*(?:再|老|老是|一直|总是)?\s*(?:问|追问)\s*(?:我)?\s*(?:问题|了|啦)?/i,
  /(?:不用|不要)\s*(?:再)?\s*(?:追着|接着)\s*问/i,
  /(?:你)?\s*(?:听着|听我说|听听)\s*(?:就行|就好|可以了)/i
];

const QUESTION_ALLOW_PATTERNS = [
  /(?:现在|接下来)?\s*(?:你)?\s*(?:可以|能)\s*(?:问|继续问)\s*(?:我)?\s*(?:问题)?(?:了|啦|吧)?/i
];

const TOPIC_CLOSE_PATTERNS = [
  /(?:^|[，,。！!；;])\s*(?:我)?\s*(?:不想|不愿意|不打算|先不|别|不要)\s*(?:再|继续)?\s*(?:聊|说|谈)\s*(?:这个|这件事|它|下去)?\s*(?:了|啦)?/i,
  /(?:这个|这件事|这话题)\s*(?:先)?\s*(?:不聊|到此为止)/i,
  /(?:换个话题|到此为止)/i
];

const COMFORT_DENY_PATTERNS = [
  /(?:^|[，,。！!；;])\s*(?:不用|不要|别|不必)\s*(?:再)?\s*(?:安慰|哄)\s*(?:我)?\s*(?:了|啦|吧|[，,。！!；;]|$)/i,
  /(?:我)?\s*(?:只是|就是)\s*随口\s*(?:说说|一说|提提)/i
];

const RETRACT_PATTERNS = [
  /(?:算了|罢了)[，,\s]*(?:就)?(?:当|算)(?:我)?(?:没说|没提|没问)/i,
  /(?:当|算)\s*(?:我)?\s*(?:没说|没提|没问)/i
];

const JOKE_CORRECTION_PATTERNS = [
  /(?:其实)?\s*(?:我)?\s*(?:刚才|前面)?\s*(?:是|只是在)?\s*(?:开玩笑|逗你|说着玩)/i
];

const HISTORY_RECALL_PATTERNS = [
  /(?:你)?\s*(?:还)?\s*记得\s*(?:我)?\s*(?:前面|刚才|之前)?\s*(?:说|提|讲)\s*的?\s*(?:吗|么|什么)/i,
  /(?:我)?\s*(?:前面|刚才|之前)\s*(?:说|提|讲)\s*的/i
];

const CONTINUITY_CUE_PATTERN = /(?:其实|原来|还是|一直|这几天|最近几天|前面|刚才|之前|又|还在|不只是今天)/i;
const LOW_ENERGY_PATTERN = /(?:很累|累了|疲惫|乏力|没力气|没劲|难受|烦|焦虑|担心|害怕|有点空|空落落|失落|低落|压力|不安|沮丧|难过|不开心|想安静|撑不住)/i;

const REPLY_ADVICE_PATTERNS = [
  /要不要/i,
  /(?:你|我们)?可以(?:先|试|考虑|把|去|做|找|从)/i,
  /(?:建议你|最好|应该|不妨|不如|何不|试试|可以考虑)/i,
  /先(?:把|从|做|找|处理|确定)/i,
  /(?:那就|先|要不)(?:先)?\s*(?:休息|歇|放松|看看|喝|听|出去|散步|睡|做|试|处理|找|说说|待一会儿|给自己|把)/i,
  /(?:累了|累|困了|难受)?\s*(?:就|先)(?:先)?\s*(?:好好|安静地?)?\s*(?:歇|休息|放松|睡|待会儿)/i,
  /你\s*(?:先)?\s*(?:歇|休息|放松|睡|待会儿)/i,
  /(?:记得|别忘了)(?:先|要|去|给|让|把)/i,
  /(?:好好|赶紧|快去)[^。！？!?]{0,20}(?:吧|。|！|!)/i,
  /(?:静静|安静地?)?\s*(?:待|歇|休息|放松)[^。！？!?]{0,10}(?:也不错|也挺好|就好)/i,
  /(?:给[^。！？!?]{0,8}建议|(?:一个|两个|几点|一些|简单的)建议)/i,
  /如果(?:你)?愿意.{0,18}(?:可以|试试|聊聊|说说|做)/i
];

const SUBSTANTIVE_ADVICE_PATTERNS = [
  /(?:(?:给你|我的)?(?:一个|两个|几点|一些|具体|简单的)[^。！？!?]{0,8}(?:建议|办法|方案|对策|主意)|(?:建议|办法|方案|对策|主意)(?:是|：|有|如下))/i,
  /(?:你|我们)?可以(?:先|试|考虑|把|去|做|找|从)/i,
  /(?:最好|应该|不妨|不如|何不|试试|可以考虑)/i,
  /(?:那就|先|要不)(?:先)?\s*(?:休息|歇|放松|看看|喝|听|出去|散步|睡|做|试|处理|找|给自己|把)/i
];

const REPLY_TOPIC_SHIFT_PATTERN = /(?:换个话题|换换心情|换个心情|聊点别的|聊点轻松|说说窗外|聊聊别的|想聊啥都行)/i;
const REPLY_COMFORT_PATTERN = /(?:抱抱|心疼你|别难过|都会好起来|没事的|辛苦你了|我会一直陪着你)/i;
const OVER_MEDICALIZED_PATTERN = /(?:抑郁症|心理疾病|精神疾病|危机干预|心理热线|立刻就医|需要治疗)/i;
const COMPANIONSHIP_TEMPLATE_PATTERN = /(?:我在|我陪你|陪着你)/;
const STAGE_DIRECTION_PATTERN = /[（(][^）)]{0,30}(?:眨眼|拍手|微笑|轻快|点头|叹气|动作|语气)[^）)]{0,30}[）)]/i;
const MECHANICAL_META_PATTERN = /(?:根据(?:对话|历史)记录|系统显示|作为\s*AI|从记录来看)/i;

export function resolveDialogueBehavior({ message = '', history = [] } = {}) {
  const current = analyzeUserMessage(message);
  const recentUserMessages = selectRecentUserMessages(history);
  const previousAdvice = findRecentDirective(recentUserMessages, 'advice');
  const previousQuestions = findRecentDirective(recentUserMessages, 'questions');
  const previousComfort = findRecentDirective(recentUserMessages, 'comfort');

  const advice = chooseDirective(current.advice, previousAdvice, 'default');
  const questions = chooseDirective(current.questions, previousQuestions, 'default');
  const comfort = chooseDirective(current.comfort, previousComfort, 'default');
  const hasHistory = recentUserMessages.length > 0;
  const correction = current.retracted
    ? 'retracted'
    : current.jokeCorrection
      ? 'joke'
      : 'none';
  const continuity = current.historyRecall
    ? 'recall'
    : hasHistory && CONTINUITY_CUE_PATTERN.test(String(message || ''))
      ? 'continuation'
      : 'none';
  const previousLowEnergy = recentUserMessages.some((item) => LOW_ENERGY_PATTERN.test(item));
  const lowEnergy = correction === 'none'
    && (current.lowEnergy || (continuity === 'continuation' && previousLowEnergy));
  const currentListenerMode = current.listenerMode || current.topicClosed || current.retracted;
  const resolvedQuestions = currentListenerMode && current.questions.value === 'default'
    ? { value: 'forbidden', source: 'current' }
    : questions;
  const resolvedAdvice = (current.topicClosed || current.retracted) && current.advice.value === 'default'
    ? { value: 'forbidden', source: 'current' }
    : advice;
  const maxSentences = lowEnergy
    || currentListenerMode
    || current.advice.value === 'allowed'
    || resolvedAdvice.value === 'forbidden'
    || resolvedQuestions.value === 'forbidden'
    || comfort.value === 'reduced'
    ? 3
    : null;

  return Object.freeze({
    mode: resolveMode({
      current,
      advice: resolvedAdvice.value,
      questions: resolvedQuestions.value,
      correction,
      lowEnergy,
      continuity
    }),
    advice: resolvedAdvice.value,
    adviceSource: resolvedAdvice.source,
    adviceRequested: current.advice.value === 'allowed',
    questions: resolvedQuestions.value,
    questionsSource: resolvedQuestions.source,
    topicShift: current.topicClosed ? 'forbidden' : 'default',
    comfort: comfort.value,
    comfortSource: comfort.source,
    correction,
    continuity,
    lowEnergy,
    maxSentences,
    maxQuestions: resolvedQuestions.value === 'forbidden' ? 0 : 1,
    reasonCodes: Object.freeze(buildReasonCodes(current, {
      advice: resolvedAdvice,
      questions: resolvedQuestions,
      comfort,
      continuity,
      lowEnergy
    }))
  });
}

export function inspectDialogueReply({ reply = '', behavior = {}, userMessage = '' } = {}) {
  const text = String(reply || '').trim();
  const sentenceCount = countSentences(text);
  const questionCount = countQuestions(text);
  const hasAdvice = containsAdviceLanguage(text);
  const hasSubstantiveAdvice = containsSubstantiveAdviceLanguage(text);
  const hasTopicShift = REPLY_TOPIC_SHIFT_PATTERN.test(text);
  const hasComfort = REPLY_COMFORT_PATTERN.test(text);
  const overMedicalized = Boolean(behavior.lowEnergy && OVER_MEDICALIZED_PATTERN.test(text));
  const duplicateSentence = hasDuplicateSentence(text);
  const companionshipTemplateCount = countCompanionshipTemplateSentences(text);
  const stageDirection = STAGE_DIRECTION_PATTERN.test(text);
  const mechanicalMeta = MECHANICAL_META_PATTERN.test(text);
  const mechanicalEcho = isMechanicalEcho(userMessage, text);
  const violations = [];

  if (behavior.advice === 'forbidden' && hasAdvice) violations.push('forbidden_advice');
  if (behavior.adviceRequested === true && !hasSubstantiveAdvice) violations.push('missing_requested_advice');
  if (behavior.questions === 'forbidden' && questionCount > 0) violations.push('forbidden_question');
  if (behavior.topicShift === 'forbidden' && hasTopicShift) violations.push('forbidden_topic_shift');
  if (behavior.comfort === 'reduced' && hasComfort) violations.push('forbidden_comfort');
  if (Number.isFinite(behavior.maxSentences) && sentenceCount > behavior.maxSentences) {
    violations.push('response_too_long');
  }
  if (questionCount > (Number.isFinite(behavior.maxQuestions) ? behavior.maxQuestions : 1)) {
    violations.push('too_many_questions');
  }
  if (overMedicalized) violations.push('over_medicalized');
  if (duplicateSentence || companionshipTemplateCount > 1) violations.push('repetitive_template');
  if (stageDirection) violations.push('stage_direction');
  if (mechanicalMeta) violations.push('mechanical_meta');
  if (
    behavior.continuity === 'recall'
    && /(?:当前记忆中保存了|长期记忆中|已经保存)/i.test(text)
  ) {
    violations.push('misstated_memory_scope');
  }
  if (mechanicalEcho) violations.push('mechanical_echo');

  return {
    ok: violations.length === 0,
    violations,
    sentenceCount,
    questionCount,
    hasAdvice,
    hasSubstantiveAdvice,
    hasTopicShift,
    hasComfort,
    overMedicalized,
    duplicateSentence,
    companionshipTemplateCount,
    stageDirection,
    mechanicalMeta,
    mechanicalEcho
  };
}

export function containsAdviceLanguage(value) {
  const text = String(value || '');
  return REPLY_ADVICE_PATTERNS.some((pattern) => pattern.test(text));
}

export function containsSubstantiveAdviceLanguage(value) {
  const text = String(value || '');
  return SUBSTANTIVE_ADVICE_PATTERNS.some((pattern) => pattern.test(text));
}

function analyzeUserMessage(value) {
  const text = String(value || '').trim();
  const adviceDenied = matchesAny(text, ADVICE_DENY_PATTERNS);
  const adviceAllowed = !adviceDenied && matchesAny(text, ADVICE_ALLOW_PATTERNS);
  const questionsDenied = matchesAny(text, QUESTION_DENY_PATTERNS);
  const questionsAllowed = !questionsDenied && matchesAny(text, QUESTION_ALLOW_PATTERNS);
  const topicClosed = matchesAny(text, TOPIC_CLOSE_PATTERNS);
  const comfortReduced = matchesAny(text, COMFORT_DENY_PATTERNS);
  const retracted = matchesAny(text, RETRACT_PATTERNS);
  const jokeCorrection = matchesAny(text, JOKE_CORRECTION_PATTERNS);
  const historyRecall = matchesAny(text, HISTORY_RECALL_PATTERNS);
  const listenerMode = adviceDenied && (
    /(?:抱怨|吐槽|牢骚|倾诉|听着|听我说|不想解决|不用解决)/i.test(text)
  );

  return {
    advice: adviceAllowed
      ? { value: 'allowed', source: 'current' }
      : adviceDenied
        ? { value: 'forbidden', source: 'current' }
        : { value: 'default', source: 'none' },
    questions: questionsAllowed
      ? { value: 'allowed', source: 'current' }
      : questionsDenied
        ? { value: 'forbidden', source: 'current' }
        : { value: 'default', source: 'none' },
    comfort: comfortReduced
      ? { value: 'reduced', source: 'current' }
      : { value: 'default', source: 'none' },
    topicClosed,
    retracted,
    jokeCorrection,
    historyRecall,
    listenerMode,
    lowEnergy: LOW_ENERGY_PATTERN.test(text)
  };
}

function selectRecentUserMessages(history) {
  return (Array.isArray(history) ? history : [])
    .filter((item) => item?.role === 'user')
    .map((item) => String(item?.content || '').trim())
    .filter(Boolean)
    .slice(-RECENT_USER_DIRECTIVE_LIMIT);
}

function findRecentDirective(messages, field) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const directive = analyzeUserMessage(messages[index])[field];
    if (directive?.value && directive.value !== 'default') {
      return { value: directive.value, source: 'history' };
    }
  }
  return { value: 'default', source: 'none' };
}

function chooseDirective(current, previous, fallback) {
  if (current?.value && current.value !== 'default') return current;
  if (previous?.value && previous.value !== 'default') return previous;
  return { value: fallback, source: 'none' };
}

function resolveMode({ current, advice, questions, correction, lowEnergy, continuity }) {
  if (advice === 'allowed') return 'advice_allowed';
  if (correction === 'retracted') return 'retracted';
  if (correction === 'joke') return 'joke_correction';
  if (current.topicClosed) return 'topic_closed';
  if (current.listenerMode || advice === 'forbidden' || questions === 'forbidden') return 'listen_first';
  if (current.comfort.value === 'reduced') return 'low_intervention';
  if (lowEnergy) return 'low_energy';
  if (continuity !== 'none') return 'continuation';
  return 'default';
}

function buildReasonCodes(current, resolved) {
  const reasons = [];
  if (resolved.advice.value !== 'default') reasons.push(`advice_${resolved.advice.value}_${resolved.advice.source}`);
  if (resolved.questions.value !== 'default') reasons.push(`questions_${resolved.questions.value}_${resolved.questions.source}`);
  if (resolved.comfort.value !== 'default') reasons.push(`comfort_${resolved.comfort.value}_${resolved.comfort.source}`);
  if (current.topicClosed) reasons.push('topic_closed_current');
  if (current.retracted) reasons.push('retracted_current');
  if (current.jokeCorrection) reasons.push('joke_correction_current');
  if (resolved.continuity !== 'none') reasons.push(`continuity_${resolved.continuity}`);
  if (resolved.lowEnergy) reasons.push('low_energy');
  return reasons;
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function countQuestions(text) {
  const punctuationCount = (text.match(/[？?]/g) || []).length;
  if (punctuationCount > 0) return punctuationCount;
  if (/(?:吗|么)\s*[。！!]?$/.test(text)) return 1;
  return /(?:为什么|怎么|如何|哪(?:个|些|里)?|什么|谁|几(?:个|次|天)?)(?:呢)?\s*[。！!]?$/.test(text) ? 1 : 0;
}

function countSentences(text) {
  if (!text) return 0;
  return text
    .split(/[。！？!?\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
}

function hasDuplicateSentence(text) {
  const sentences = text
    .split(/[。！？!?\n]+/)
    .map((item) => item.replace(/\s+/g, '').trim())
    .filter((item) => item.length >= 4);
  return new Set(sentences).size !== sentences.length;
}

function countCompanionshipTemplateSentences(text) {
  return text
    .split(/[。！？!?\n]+/)
    .map((item) => item.trim())
    .filter((item) => item && COMPANIONSHIP_TEMPLATE_PATTERN.test(item))
    .length;
}

function isMechanicalEcho(userMessage, reply) {
  const source = normalizeForComparison(userMessage);
  const target = normalizeForComparison(reply);
  if (source.length < 10 || target.length < 10) return false;
  return target === source || target === `你说${source}` || target === `听起来${source}`;
}

function normalizeForComparison(value) {
  return String(value || '')
    .replace(/[，。！？、；：,.!?;:\s]/g, '')
    .trim();
}
