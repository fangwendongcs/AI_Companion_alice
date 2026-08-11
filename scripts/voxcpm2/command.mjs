import { spawnSync } from 'node:child_process';
import path from 'node:path';

const commands = {
  setup: 'setup-runtime.sh',
  start: 'start-local-mps.sh',
  stop: 'stop-local.sh',
  race: 'run-local-race.sh'
};
const command = String(process.argv[2] || '').trim().toLowerCase();
const script = commands[command];
if (!script) {
  console.error(`[voxcpm2] expected command: ${Object.keys(commands).join('|')}`);
  process.exit(2);
}

const result = spawnSync('bash', [path.join(process.cwd(), 'scripts/voxcpm2', script)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});
if (result.error) {
  console.error(`[voxcpm2] ${result.error.message}`);
  process.exit(1);
}
process.exit(Number.isInteger(result.status) ? result.status : 1);
