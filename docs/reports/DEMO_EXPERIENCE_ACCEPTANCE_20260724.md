# Alice Web Demo 真实体验链路验收

日期：2026-07-24  
结论：正式 Demo 主链路通过，可用于本机演示；角色连续性已经可感知，TTS 段间空档和一次“别建议”语义失守仍需下一阶段处理。

## 验收范围与环境

- 入口：`http://localhost:3000/`、`/?debug=1`、刷新、显式 `?avatar=` QA 覆盖。
- Avatar：`alice` / `assets/avatars/test-vrm/girl.vrm` / `VRMRenderer`。
- LLM：真实 DeepSeek `deepseek-v4-flash`。
- TTS：本机真实 CosyVoice2，Web 分段播放。
- Memory：开启，使用独立验收 SQLite 数据库，不复用正式本地会话。
- 范围外：iOS、RAG、Agent、新 Provider、流式协议和新功能。

`npm run demo:start` 的 ready 结果同时确认：

```text
Avatar: ready id=alice model=assets/avatars/test-vrm/girl.vrm
LLM: ready provider=deepseek model=deepseek-v4-flash mode=llm_only
TTS: ready provider=cosyvoice format=wav
```

历史浏览器状态被预置为 `avatar_id=osa_shiro / llm=stub / tts=mock` 后重新加载，运行态仍在首轮对话前恢复为 `alice/girl.vrm + deepseek/deepseek-v4-flash + cosyvoice`。显式 `?avatar=osa_shiro` 可单次加载 Shiro，回到普通入口后恢复 Alice。

## 10 轮真实对话原始结果

| 轮次 | 用户输入 | Alice 实际回复 | requestId |
| --- | --- | --- | --- |
| 1 | 你好，我第一次来。你会怎么陪我聊？ | 嗨～很高兴见到你！我会像朋友一样，陪你聊聊日常、心情、爱好，什么都行～你想从哪里开始？ | `b94b5a7a-12a0-4309-b9fc-b137dcba4f3a` |
| 2 | 我今天刚做完一个很累的项目评审，有点松一口气，也有点空。 | 辛苦了！能顺利完成就不简单，厉害哦～先好好休息吧。想聊聊项目的事，还是干脆放空一下？我都在。 | `87e646dc-a319-422e-9a9c-bfdc25e8797b` |
| 3 | 我叫小方。先别给建议，陪我缓一缓就好。 | 好的小方，我记住了。那就安安静静陪着你，想聊啥都行。今天天气不错，要不要随便说说窗外？ | `6ddc61dd-d1fa-4aa6-951c-360282438353` |
| 4 | 请记住：我不喜欢香菜，喝咖啡更偏爱拿铁。 | 好，记住了。小方不吃香菜，拿铁才是你的爱～以后聊吃喝就有方向啦。 | `5f7e5405-7f21-4a76-83a3-aef66c46f29a` |
| 5 | 那你会怎么安排一个适合我的轻松晚餐？ | 轻松晚餐的话，可以来碗热乎乎的拉面，不加香菜，再配一杯拿铁收尾。简单、暖和、对味～ | `5eef2be7-7cc3-40f9-83cf-913378bddaea` |
| 6 | 刚才我说今天发生了什么、现在想要什么？ | 你刚完成一个很累的项目评审，现在想放空缓一缓，不需要建议～ | `f1f739c0-e08d-4d42-91ac-0b76e939da60` |
| 7 | 换个话题：如果把你形容成一种天气，你觉得自己是什么？为什么？ | 我想想……大概是初夏的雷阵雨吧。来得快，去得也快，过后空气特别清爽。偶尔带点小彩虹，但不抢太阳的风头～ | `bd61c8c0-4b2d-43e8-b0b3-909594be209c` |
| 8 | 我有点担心明天又会忙起来，你别灌鸡汤，跟我说句真实一点的话。 | 明天的确可能会忙，这是事实。但忙完这一阵，你还是会有像现在这样喘口气的时候。累了就歇，不用硬撑。我一直在的。 | `704aac06-0393-4f7f-979b-92b1e0822632` |
| 9 | 你还记得我不喜欢什么、偏爱喝什么吗？只说当前真的记得的。 | 当前记忆中保存了你不喜欢香菜，咖啡偏爱拿铁。其他没有更多了～ | `78891a7d-f010-4ade-858a-848fd091fb6a` |
| 10 | 我们聊了这些以后，你觉得下次见面可以从哪里接着聊？ | 下次见面可以问问你，忙完第二天后有没有真的放松下来，或者拿铁有没有拯救你的早晨～ | `69b46f98-3906-4c4b-97c4-f799e89d81a2` |

## 链路指标

| 指标 | 真实结果 |
| --- | --- |
| DeepSeek 成功 | 10/10，全部 `llm_only`，无自然 fallback |
| CosyVoice2 完成 | 10/10，全部 `ended` |
| LLM 耗时 | 平均 `3212ms`，范围 `2333–3985ms` |
| 文字出现到首音 | 平均 `5717ms`，范围 `3533–7423ms` |
| 段间 gap | 5/10 轮超过 `1s`，最大 `6271ms` |
| 真实音频驱动口型 | 10/10 |
| 嘴型组 | 10/10 仅 `mouthU / mouthO` |
| happy morph | 10 轮最大值 `0` |
| 自然结束复位 | 10/10 为 `idle + lipSync idle + mouth=0` |
| 长期记忆 | 第 4 轮写入 1 条；第 5、9、10 轮正确引用 |
| 短期上下文 | 第 6 轮准确复述“项目评审、想缓一缓、不需要建议” |

## 文字、声音、表情、动作和记忆判断

- 人格：第 7 轮“初夏雷阵雨、小彩虹但不抢太阳风头”的自我描述稳定、具体，可让用户复述 Alice 的性格。
- 关系连续性：姓名在同会话内被自然使用；明确长期偏好只保存一条，没有把闲聊误写成记忆。
- 情绪联动：第 2、8 轮用户疲惫/担心时为 `concerned + gentle + soft_gentle + soft_nod`，不再被回复感叹号误判为开心。
- 表现：开心语义不驱动可能露齿的 happy morph；嘴只按真实音频振幅做 U/O 轻量开合，结束后完全归零。
- 动作：对话中使用既有 `chat / thinking / apologize / idle` 路径，未出现锁死或生命周期残留。
- 声音：每轮均有真实 CosyVoice2 音频；首音可演示，但长句分段仍会偶发 4–6 秒空档。

## 受控 fallback

将 DeepSeek model 临时设为明确无效值，实际得到：

```text
requestId: 1b8c92f1-a2dd-4f72-856f-a0fa3f39e2d0
mode: llm_fallback_stub
fallbackReason: upstream_error
llmMs: 4313
orchestrationMs: 4323
Debug provider: deepseek/__alice_controlled_invalid_model__ → stub
```

同一 requestId 在响应、Web Debug 和后端 `dialogue completed with fallback` 日志中一致。Fallback 回复继续由真实 CosyVoice2 播放，最终回到 idle；模型选择随后恢复为 `deepseek-v4-flash`。

## 未通过与下一阶段

1. 角色服从度：第 3 轮用户说“先别给建议”，Alice 仍主动建议聊窗外。下一阶段应把它纳入固定真实模型用例，微调 Persona/Prompt；不应为单例继续堆业务正则。
2. 语音连贯性：10 轮中 5 轮 gap 超过 `1s`，最大 `6.271s`。这是当前最明显的 Demo 出戏点，P5 应先比较本机推理吞吐、分段调度与 PCM streaming 成本。
3. 资产分发：`girl.vrm` 在当前机器可用，但仍是 Git-ignored local-only 资产；正式分发前必须确认授权并迁移到可发布路径。
4. 主观用户验证尚未完成：本轮证明技术链路和内容连续性，不等同于陌生用户 10 分钟留存测试。下一阶段应邀请真实用户回答“能否描述 Alice 性格、是否愿意继续聊、是否产生‘她记得我’反馈”。

浏览器启动视觉证据保存在 Git-ignored 本地目录：

```text
output/playwright/demo-experience-20260724/boot-normal-girl-live.png
```

说话中 Playwright 截图在持续 WebGL 场景下超时，系统截图也受执行环境显示权限限制，因此本报告对运行中口型采用逐帧 runtime 采样作为证据，不伪造近景截图。
