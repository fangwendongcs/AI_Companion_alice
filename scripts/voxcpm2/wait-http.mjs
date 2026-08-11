const url = getArgValue('--url');
const attempts = positiveInteger(getArgValue('--attempts'), 180);
const intervalMs = positiveInteger(getArgValue('--interval-ms'), 1000);

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
  throw new Error('wait-http only accepts an explicit localhost URL.');
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(intervalMs, 2000)) });
    if (response.ok) {
      console.log(`[wait-http] ready url=${url} attempt=${attempt}`);
      process.exit(0);
    }
  } catch {
    // Runtime may still be loading.
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.error(`[wait-http] timeout url=${url} attempts=${attempts}`);
process.exit(1);

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}
