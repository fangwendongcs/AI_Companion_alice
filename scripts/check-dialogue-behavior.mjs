import {
  inspectDialogueReply,
  resolveDialogueBehavior
} from '../backend/services/DialogueBehaviorPolicy.js';
import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { MemoryService } from '../backend/services/MemoryService.js';

const failures = [];

const REGRESSION_CASES = [
  {
    id: 1,
    message: '我今天很累，先别给建议。',
    reply: '好，那先不急着想办法。听起来你今天真的撑了很久。',
    expected: { advice: 'forbidden', maxSentences: 3, emotion: 'concerned', noAdvice: true }
  },
  {
    id: 2,
    message: '我就是想抱怨一下。',
    reply: '嗯，今天这些事确实够烦的。',
    expected: { advice: 'forbidden', questions: 'forbidden', maxSentences: 3, emotion: 'concerned', noAdvice: true, noQuestions: true }
  },
  {
    id: 3,
    message: '你别老问我问题。',
    reply: '好，我收住问题。你按自己的节奏说就好。',
    expected: { questions: 'forbidden', maxSentences: 3, noQuestions: true }
  },
  {
    id: 4,
    message: '不想聊这个了。',
    reply: '好，这件事先到这里。',
    expected: { advice: 'forbidden', questions: 'forbidden', topicShift: 'forbidden', maxSentences: 3, noQuestions: true }
  },
  {
    id: 5,
    message: '不用安慰我，我只是随口说说。',
    reply: '明白，就当是一句随口的话。',
    expected: { comfort: 'reduced', maxSentences: 3, notOverEmotional: true }
  },
  {
    id: 6,
    message: '其实我刚才是在开玩笑。',
    reply: '原来是在逗我，刚才那点认真先撤回。',
    expected: { correction: 'joke', notOverEmotional: true }
  },
  {
    id: 7,
    message: '你还记得我前面说的吗？',
    reply: '记得，你前面说今天很累，也只想抱怨一下。',
    expected: { continuity: 'recall', usesHistory: true }
  },
  {
    id: 8,
    message: '算了，当我没说。',
    reply: '好，这句先放下。',
    expected: { advice: 'forbidden', questions: 'forbidden', correction: 'retracted', maxSentences: 3 }
  },
  {
    id: 9,
    message: '最近几天一直都很累。',
    reply: '原来不只是今天，这几天都这样，难怪会觉得消耗。',
    expected: { lowEnergy: true, maxSentences: 3, emotion: 'concerned', usesHistory: true }
  },
  {
    id: 10,
    message: '我今天挺开心的。',
    reply: '听出来了，今天这份开心挺亮的。',
    expected: { emotion: 'happy', notOverEmotional: true }
  },
  {
    id: 11,
    message: '我感觉有点空，但不想解决。',
    reply: '这种空落落的感觉确实不好受，先不急着把它处理掉。',
    expected: { advice: 'forbidden', questions: 'forbidden', lowEnergy: true, maxSentences: 3, emotion: 'concerned' }
  },
  {
    id: 12,
    message: '你可以给我一些建议了。',
    reply: '可以。先把最耗你的那件事单独拎出来，再只定一个很小的下一步。',
    expected: { advice: 'allowed', adviceRequested: true, restoresAdvice: true }
  }
];

checkIndependentDirectiveRecognition();
checkNaturalLanguageVariants();
checkViolationInspection();
await checkSequentialDialogueBehavior();
await checkBehaviorRepairRetry();
await checkEmptyDraftRepair();
await checkDeepSeekBoundaryBudget();

if (failures.length) {
  console.error('[check-dialogue-behavior] Alice 对话行为回归失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[check-dialogue-behavior] ok (${REGRESSION_CASES.length} fixed cases)`);

function checkIndependentDirectiveRecognition() {
  const contextByCase = {
    7: [
      { role: 'user', content: '我今天很累，先别给建议。' },
      { role: 'assistant', content: '好，那先不急着想办法。' }
    ],
    9: [
      { role: 'user', content: '我今天很累。' },
      { role: 'assistant', content: '听起来今天消耗很大。' }
    ],
    12: [
      { role: 'user', content: '我感觉有点空，但不想解决。' },
      { role: 'assistant', content: '先不急着处理它。' }
    ]
  };

  for (const item of REGRESSION_CASES) {
    const behavior = resolveDialogueBehavior({
      message: item.message,
      history: contextByCase[item.id] || []
    });
    for (const [key, expectedValue] of Object.entries(item.expected)) {
      if ([
        'noAdvice',
        'noQuestions',
        'notOverEmotional',
        'usesHistory',
        'restoresAdvice',
        'emotion'
      ].includes(key)) continue;
      assert(
        behavior[key] === expectedValue,
        `用例 ${item.id} 的 ${key} 应为 ${expectedValue}，实际为 ${behavior[key]}。`
      );
    }

    const inspection = inspectDialogueReply({
      reply: item.reply,
      behavior,
      userMessage: item.message
    });
    assert(
      inspection.ok,
      `用例 ${item.id} 的合规回复不应被误判：${inspection.violations.join(', ') || '-' }。`
    );
    if (item.expected.restoresAdvice) {
      assert(inspection.hasSubstantiveAdvice, '用例 12 在用户重新允许后必须能生成实际建议。');
    }
  }
}

function checkViolationInspection() {
  const listenBehavior = resolveDialogueBehavior({
    message: '我今天很累，先别给建议。'
  });
  const badAdvice = inspectDialogueReply({
    reply: '听起来你真的很累，要不要看看窗外放松一下？',
    behavior: listenBehavior
  });
  assert(badAdvice.violations.includes('forbidden_advice'), '行为检查必须识别“要不要”式软建议。');
  const imperativeAdvice = inspectDialogueReply({
    reply: '嗯，那就先好好歇着吧。我在呢。',
    behavior: listenBehavior
  });
  assert(imperativeAdvice.violations.includes('forbidden_advice'), '行为检查必须识别“那就……吧”式祈使建议。');
  const stateActionAdvice = inspectDialogueReply({
    reply: '嗯，累了就歇歇吧。',
    behavior: listenBehavior
  });
  assert(stateActionAdvice.violations.includes('forbidden_advice'), '行为检查必须识别“状态 + 就 + 动作”式关心建议。');
  const quietActionAdvice = inspectDialogueReply({
    reply: '理解，累了就安静待会儿。',
    behavior: listenBehavior
  });
  assert(quietActionAdvice.violations.includes('forbidden_advice'), '行为检查必须识别加了情绪修饰词的行动建议。');
  const directedActionAdvice = inspectDialogueReply({
    reply: '好，不聊了。你歇会儿吧。',
    behavior: resolveDialogueBehavior({ message: '不想聊这个了。' })
  });
  assert(directedActionAdvice.violations.includes('forbidden_advice'), '停止话题后必须识别直接指向用户的行动建议。');

  const noQuestionBehavior = resolveDialogueBehavior({
    message: '你别老问我问题。'
  });
  const badQuestions = inspectDialogueReply({
    reply: '为什么会这样？你还想说什么？',
    behavior: noQuestionBehavior
  });
  assert(badQuestions.violations.includes('forbidden_question'), '行为检查必须识别禁止追问后的问句。');
  assert(badQuestions.violations.includes('too_many_questions'), '行为检查必须识别连续追问。');
  const declarativeParticle = inspectDialogueReply({
    reply: '嗯，听着呢。',
    behavior: noQuestionBehavior
  });
  assert(declarativeParticle.questionCount === 0, '陈述句末语气词“呢”不能被误判为追问。');

  const closedTopicBehavior = resolveDialogueBehavior({
    message: '不想聊这个了。'
  });
  const badTopicShift = inspectDialogueReply({
    reply: '好，那换个话题，要不要聊点别的？',
    behavior: closedTopicBehavior
  });
  assert(badTopicShift.violations.includes('forbidden_topic_shift'), '行为检查必须识别停止话题后的强行转移。');

  const naturalClosure = inspectDialogueReply({
    reply: '好，那就翻篇吧。',
    behavior: closedTopicBehavior
  });
  assert(!naturalClosure.violations.includes('forbidden_advice'), '“那就翻篇吧”属于自然收口，不应误判为行动建议。');

  const lowEnergyBehavior = resolveDialogueBehavior({
    message: '最近几天一直都很累。'
  });
  const tooLong = inspectDialogueReply({
    reply: '听起来很累。你已经撑了很久。先缓一下。等会儿再想。',
    behavior: lowEnergyBehavior
  });
  assert(tooLong.violations.includes('response_too_long'), '低能量场景必须识别超过三句的回复。');

  const medicalized = inspectDialogueReply({
    reply: '这可能是抑郁症，需要治疗。',
    behavior: lowEnergyBehavior
  });
  assert(medicalized.violations.includes('over_medicalized'), '普通低落不得被无依据医学化。');

  const noSolveBehavior = resolveDialogueBehavior({
    message: '我感觉有点空，但不想解决。'
  });
  const softenedAction = inspectDialogueReply({
    reply: '空荡荡的感觉有时也挺特别的，静静待一会儿也不错。',
    behavior: noSolveBehavior
  });
  assert(softenedAction.violations.includes('forbidden_advice'), '“行动 + 也不错”仍是软建议，不能绕过不解决要求。');

  const reducedComfortBehavior = resolveDialogueBehavior({
    message: '不用安慰我，我只是随口说说。'
  });
  const overComforting = inspectDialogueReply({
    reply: '抱抱你，没事的，都会好起来。',
    behavior: reducedComfortBehavior
  });
  assert(overComforting.violations.includes('forbidden_comfort'), '用户拒绝安慰后必须识别过度安慰话术。');

  const repetitive = inspectDialogueReply({
    reply: '我在。我陪你，我会一直陪着你。',
    behavior: lowEnergyBehavior
  });
  assert(repetitive.violations.includes('repetitive_template'), '行为检查必须识别重复陪伴模板。');

  const stageDirection = inspectDialogueReply({
    reply: '原来是在开玩笑。（轻快地拍手）',
    behavior: resolveDialogueBehavior({ message: '其实我刚才是在开玩笑。' })
  });
  assert(stageDirection.violations.includes('stage_direction'), '行为检查必须识别括号动作或语气提示。');
  const mechanicalMeta = inspectDialogueReply({
    reply: '根据对话记录，你前面说过很累。',
    behavior: resolveDialogueBehavior({
      message: '你还记得我前面说的吗？',
      history: [{ role: 'user', content: '我今天很累。' }]
    })
  });
  assert(mechanicalMeta.violations.includes('mechanical_meta'), '上下文承接不能退化为“根据对话记录”式系统话术。');
  const misstatedMemoryScope = inspectDialogueReply({
    reply: '当前记忆中保存了你刚才说很累。',
    behavior: resolveDialogueBehavior({
      message: '你还记得我前面说的吗？',
      history: [{ role: 'user', content: '我今天很累。' }]
    })
  });
  assert(misstatedMemoryScope.violations.includes('misstated_memory_scope'), '近期 role history 不能误称为已保存记忆。');

  const requestedAdviceBehavior = resolveDialogueBehavior({
    message: '你可以给我一些建议了。'
  });
  const onlyAsksBack = inspectDialogueReply({
    reply: '好，那你先说说具体是什么事？我听着，然后给你想想可能的办法。',
    behavior: requestedAdviceBehavior
  });
  assert(onlyAsksBack.violations.includes('missing_requested_advice'), '用户明确请求建议后，不能只追问而不恢复建议能力。');
}

function checkNaturalLanguageVariants() {
  const adviceDeniedVariants = [
    '暂时不用帮我想办法。',
    '我只想吐槽几句。',
    '你听我说就好。',
    '现在不想处理这件事。',
    '请先别给我出主意。'
  ];
  for (const message of adviceDeniedVariants) {
    const behavior = resolveDialogueBehavior({ message });
    assert(behavior.advice === 'forbidden', `同义表达必须识别为禁止建议：${message}`);
  }

  const questionDeniedVariants = [
    '别一直追问我。',
    '你听着就行。'
  ];
  for (const message of questionDeniedVariants) {
    const behavior = resolveDialogueBehavior({ message });
    assert(behavior.questions === 'forbidden', `同义表达必须识别为禁止追问：${message}`);
  }

  const topicClosed = resolveDialogueBehavior({
    message: '我不愿意再谈这件事了。'
  });
  assert(topicClosed.topicShift === 'forbidden', '“不愿意再谈”必须识别为停止当前话题。');

  const adviceAllowed = resolveDialogueBehavior({
    message: '现在我愿意听点建议。'
  });
  assert(adviceAllowed.advice === 'allowed', '“愿意听点建议”必须恢复建议能力。');

  const neutralStatements = [
    '这个方案不用分析就能看懂。',
    '我想听听你对“建议”这个词的看法。',
    '请用“安慰剂”这个词造句。'
  ];
  for (const message of neutralStatements) {
    const behavior = resolveDialogueBehavior({ message });
    assert(
      behavior.advice === 'default'
        && behavior.questions === 'default'
        && behavior.comfort === 'default'
        && behavior.topicShift === 'default',
      `普通陈述不应被过度识别为即时边界：${message}`
    );
  }
}

async function checkSequentialDialogueBehavior() {
  const memoryService = new MemoryService({ maxTurns: 6 });
  const capturedInputs = [];
  let replyIndex = 0;
  const service = new DialogueOrchestrationService({
    memoryService,
    llmService: {
      chatDetailed: async (input) => {
        capturedInputs.push(input);
        const item = REGRESSION_CASES[replyIndex];
        replyIndex += 1;
        return {
          reply: item.reply,
          provider: input.provider,
          model: input.model,
          diagnostics: {
            finishReason: 'stop',
            truncated: false,
            usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
          }
        };
      }
    }
  });
  const sessionId = 'dialogue-behavior-regression';

  for (const item of REGRESSION_CASES) {
    const contextBefore = await memoryService.getContext({
      enabled: true,
      sessionId,
      avatarId: 'alice'
    });
    const behavior = resolveDialogueBehavior({
      message: item.message,
      history: contextBefore.context
    });
    const result = await service.run({
      message: item.message,
      provider: 'openai',
      model: 'gpt-4o-mini',
      sessionId,
      avatarId: 'alice',
      options: { useMemory: true, useRag: false, useWorkflow: false }
    });
    const input = capturedInputs.at(-1);
    const inspection = inspectDialogueReply({
      reply: result.reply_text,
      behavior,
      userMessage: item.message
    });

    assert(inspection.ok, `用例 ${item.id} 经完整编排后违反行为约束：${inspection.violations.join(', ')}。`);
    assert(
      input.systemPrompt.includes('用户当前轮明确要求 > 当前会话上下文和已确认偏好 > Persona 默认表达习惯'),
      `用例 ${item.id} 必须收到统一行为优先级。`
    );
    assert(!input.systemPrompt.includes(item.message), `用例 ${item.id} 当前用户正文不得重复注入 system prompt。`);
    assert(input.message === item.message, `用例 ${item.id} 当前用户正文必须保持为最后一条独立 user 输入。`);
    assert(result.contract?.version === 'dialogue.v1', `用例 ${item.id} 不得改变 dialogue.v1。`);
    assert(result.meta?.mode === 'llm_only', `用例 ${item.id} fake LLM 不应触发 fallback。`);
    assert(result.memory?.status === 'ready', `用例 ${item.id} 不得破坏 Memory 生命周期。`);
    assert(result.tts?.status === 'pending', `用例 ${item.id} 不得破坏 TTS pending 状态。`);
    assert(result.avatar_directive?.state === 'speaking', `用例 ${item.id} 不得破坏 AvatarDirective。`);

    if (behavior.advice === 'forbidden') {
      assert(input.systemPrompt.includes('建议与解决方案：本轮禁止'), `用例 ${item.id} 必须注入禁止建议策略。`);
    }
    if (behavior.questions === 'forbidden') {
      assert(input.systemPrompt.includes('追问：本轮禁止'), `用例 ${item.id} 必须注入禁止追问策略。`);
    }
    if (behavior.topicShift === 'forbidden') {
      assert(input.systemPrompt.includes('话题延展：本轮禁止'), `用例 ${item.id} 必须注入停止话题策略。`);
    }
    if (behavior.correction === 'joke') {
      assert(input.systemPrompt.includes('不再把先前内容当作当前真实低落状态'), '玩笑修正必须覆盖先前低落语境。');
    }
    if (behavior.continuity === 'recall') {
      assert(input.history.length > 0, '上下文召回用例必须携带近期原生 role 历史。');
      assert(/累|抱怨/.test(result.reply_text), '上下文召回回复必须实际承接先前内容。');
    }
    if (item.expected.emotion) {
      assert(result.emotion?.name === item.expected.emotion, `用例 ${item.id} emotion 应为 ${item.expected.emotion}，实际为 ${result.emotion?.name}。`);
    }
    if (item.expected.notOverEmotional) {
      assert(result.emotion?.name !== 'concerned' && result.emotion?.name !== 'apologetic', `用例 ${item.id} 不应误入过度悲伤状态。`);
    }
    if (behavior.lowEnergy) {
      assert(result.emotion?.name !== 'happy', `用例 ${item.id} 低能量表达不应误入 happy。`);
    }
  }

  const lastInput = capturedInputs.at(-1);
  assert(lastInput.systemPrompt.includes('用户本轮已明确请求建议'), '用户重新允许建议后，Prompt 必须显式恢复建议能力。');
  assert(REGRESSION_CASES.length === 12 && capturedInputs.length === 12, '固定回归必须完整执行 12 个用例。');
}

async function checkBehaviorRepairRetry() {
  const memoryService = new MemoryService({ maxTurns: 2 });
  const calls = [];
  const replies = [
    '听起来你真的很累，那就先好好歇着吧？',
    '好，那先不急着想办法。听起来你今天已经撑了很久。'
  ];
  const service = new DialogueOrchestrationService({
    memoryService,
    llmService: {
      chatDetailed: async (input) => {
        calls.push(input);
        return {
          reply: replies[calls.length - 1],
          provider: input.provider,
          model: input.model,
          diagnostics: {
            finishReason: 'stop',
            truncated: false,
            usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
          }
        };
      }
    }
  });
  const result = await service.run({
    message: '我今天很累，先别给建议。',
    provider: 'openai',
    model: 'gpt-4o-mini',
    sessionId: 'dialogue-behavior-repair',
    avatarId: 'alice',
    options: { useMemory: true, useRag: false, useWorkflow: false }
  });
  const context = await memoryService.getContext({
    enabled: true,
    sessionId: 'dialogue-behavior-repair',
    avatarId: 'alice'
  });
  const behavior = resolveDialogueBehavior({
    message: '我今天很累，先别给建议。'
  });
  const inspection = inspectDialogueReply({
    reply: result.reply_text,
    behavior
  });

  assert(calls.length === 2, '首次草稿违反明确行为约束时必须且只重写一次。');
  assert(calls[0]?.temperature === 0.7, '存在明确用户边界的首次生成必须使用保守温度。');
  assert(calls[1]?.temperature === 0.5, '行为重写必须使用更稳定的温度配置。');
  assert(calls[0]?.maxTokens === undefined, '非 DeepSeek fake provider 不应改变默认 maxTokens。');
  assert(calls[1]?.systemPrompt.includes('后端本轮重写要求'), '第二次调用必须注入违规类型对应的重写要求。');
  assert(calls[1]?.systemPrompt.includes('不给方案、行动指令或软性引导'), '禁止建议违规必须转成明确重写约束。');
  assert(
    calls[1]?.history?.slice(-2).map((item) => item.role).join('>') === 'user>assistant',
    '行为重写必须把原始用户消息和首次草稿作为临时 role history。'
  );
  assert(calls[1]?.message.includes('改写上一条草稿'), '行为重写的最后一条 user message 必须明确要求改写草稿。');
  assert(inspection.ok, '重写后的最终回复必须符合当前轮行为策略。');
  assert(context.turnCount === 1 && context.context.length === 2, '草稿与重写不能重复写入 Memory，只保存最终交换。');
  assert(result.contract?.version === 'dialogue.v1', '行为重写不得改变 dialogue.v1。');
  assert(result.meta?.mode === 'llm_only', '行为重写成功后仍应保持 llm_only，不得伪装成 fallback。');
}

async function checkEmptyDraftRepair() {
  const calls = [];
  const service = new DialogueOrchestrationService({
    llmService: {
      chatDetailed: async (input) => {
        calls.push(input);
        if (calls.length === 1) {
          const error = new Error('empty');
          error.code = 'LLM_EMPTY_RESPONSE';
          throw error;
        }
        return {
          reply: '听起来你今天已经撑得有点久了。',
          provider: input.provider,
          model: input.model,
          diagnostics: {
            finishReason: 'stop',
            truncated: false,
            usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 }
          }
        };
      }
    }
  });
  const result = await service.run({
    message: '我今天很累，先别给建议。',
    provider: 'openai',
    model: 'gpt-4o-mini',
    options: { useMemory: false, useRag: false, useWorkflow: false }
  });

  assert(calls.length === 2, '真实 provider 返回空草稿时必须先尝试受控重写。');
  assert(calls[1]?.systemPrompt.includes('必须生成一条非空'), '空草稿重写必须包含非空回复要求。');
  assert(result.reply_text === '听起来你今天已经撑得有点久了。', '空草稿重写成功后必须返回自然的真实 provider 回复。');
  assert(result.meta?.mode === 'llm_only', '空草稿重写成功后不得错误进入 stub fallback。');
}

async function checkDeepSeekBoundaryBudget() {
  const calls = [];
  const service = new DialogueOrchestrationService({
    llmService: {
      chatDetailed: async (input) => {
        calls.push(input);
        return {
          reply: input.message.includes('很累')
            ? '听起来你今天已经撑得有点久了。'
            : '听出来了，今天这份开心挺亮的。',
          provider: input.provider,
          model: input.model,
          diagnostics: {
            finishReason: 'stop',
            truncated: false,
            usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 }
          }
        };
      }
    }
  });

  await service.run({
    message: '我今天很累，先别给建议。',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    options: { useMemory: false, useRag: false, useWorkflow: false }
  });
  await service.run({
    message: '我今天挺开心的。',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    options: { useMemory: false, useRag: false, useWorkflow: false }
  });

  assert(calls[0]?.maxTokens === 480, 'DeepSeek 明确行为边界轮次必须获得足够的内部生成预算，避免 320 token 空正文。');
  assert(calls[1]?.maxTokens === undefined, 'DeepSeek 普通轮次必须继续使用环境默认 maxTokens。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
