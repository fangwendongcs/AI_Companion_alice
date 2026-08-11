import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputDir = path.resolve(process.cwd(), getArgValue('--output-dir'));
const reports = await Promise.all(['cosyvoice', 'voxcpm2'].map(async (provider) => {
  const file = path.join(outputDir, provider, 'report.json');
  const data = JSON.parse(await readFile(file, 'utf8'));
  if (data.schema !== 'alice.tts-local-race.v1' || !data.summary?.[provider]) {
    throw new Error(`Invalid ${provider} report: ${file}`);
  }
  return data;
}));

const attempts = reports.flatMap((report) => report.attempts);
const merged = {
  schema: 'alice.tts-local-race.v1',
  generatedAt: new Date().toISOString(),
  fairness: reports[0].fairness,
  preflight: reports.flatMap((report) => report.preflight),
  corpus: reports[0].corpus,
  continuousCount: reports[0].continuousCount,
  attempts,
  summary: Object.assign({}, ...reports.map((report) => report.summary)),
  comparison: createComparison(reports),
  browserLifecycle: {
    cancel: null,
    mute: null,
    fallback: null,
    finalIdle: null,
    segmentGapMs: null,
    note: 'Filled only after the separate real browser acceptance.'
  },
  qualityReview: {
    status: 'pending_blind_listening',
    dimensions: ['音质', '中文自然度', '韵律', '角色一致性', '杂音/断裂']
  },
  passed: reports.every((report) => report.passed === true)
};

await mkdir(path.join(outputDir, 'listening'), { recursive: true });
const listeningRows = [];
for (const [index, item] of merged.corpus.entries()) {
  const aProvider = index % 2 === 0 ? 'cosyvoice' : 'voxcpm2';
  const bProvider = aProvider === 'cosyvoice' ? 'voxcpm2' : 'cosyvoice';
  const a = attempts.find((row) => row.provider === aProvider && row.caseId === item.id);
  const b = attempts.find((row) => row.provider === bProvider && row.caseId === item.id);
  const aName = `${item.id}-A.wav`;
  const bName = `${item.id}-B.wav`;
  await copyEvidence(a, aProvider, aName);
  await copyEvidence(b, bProvider, bName);
  listeningRows.push({ caseId: item.id, category: item.category, aName, bName, aProvider, bProvider });
}

await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputDir, 'LISTENING_REVIEW.md'), renderReview(listeningRows), 'utf8');
console.log(`[tts-local-race] merged report=${path.join(outputDir, 'report.json')}`);

async function copyEvidence(attempt, provider, destinationName) {
  if (!attempt?.outputFile) throw new Error(`Missing ${provider} audio evidence for ${attempt?.caseId || destinationName}`);
  const source = path.join(outputDir, provider, attempt.outputFile);
  const data = await readFile(source);
  await writeFile(path.join(outputDir, 'listening', destinationName), data);
}

function createComparison(allReports) {
  const cosy = allReports.find((report) => report.summary.cosyvoice)?.summary.cosyvoice;
  const vox = allReports.find((report) => report.summary.voxcpm2)?.summary.voxcpm2;
  return {
    warmRequestToFirstPlayableP50DeltaMs: subtract(vox.warmRequestToFirstPlayableP50Ms, cosy.warmRequestToFirstPlayableP50Ms),
    fullAudioReadyP50DeltaMs: subtract(vox.fullAudioReadyP50Ms, cosy.fullAudioReadyP50Ms),
    rtfP50Delta: subtract(vox.rtfP50, cosy.rtfP50),
    peakRssBytesDelta: subtract(vox.peakRssBytes, cosy.peakRssBytes)
  };
}

function renderReview(rows) {
  const lines = [
    '# CosyVoice2 vs VoxCPM2 盲听记录',
    '',
    '请先只打开 `listening/` 中的 A/B WAV，对音质、中文自然度、韵律、角色一致性、杂音/断裂各打 1–5 分。评分后再看文末映射。',
    '',
    '| 语料 | A | B | 偏好 | 音质 | 中文自然度 | 评语 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.category} | listening/${row.aName} | listening/${row.bName} | 待填 | 待填 | 待填 | 待填 |`),
    '',
    '<details><summary>评分后展开 Provider 映射</summary>',
    '',
    ...rows.map((row) => `- ${row.caseId}: A=${row.aProvider}, B=${row.bProvider}`),
    '',
    '</details>',
    ''
  ];
  return `${lines.join('\n')}\n`;
}

function subtract(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) ? Number((left - right).toFixed(4)) : null;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  if (!match || !match.slice(prefix.length)) throw new Error(`${name} is required`);
  return match.slice(prefix.length);
}
