// Test-only process fixtures for timeout, crash, protocol, and concurrency paths.
import { execFileSync } from 'node:child_process';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const mode = process.argv[2];
if (mode === 'crash') process.exit(7);
if (mode === 'invalid') { process.stdout.write('not JSON'); process.exit(0); }
if (mode === 'incomplete') { process.stdout.write('{"greedy":{}}'); process.exit(0); }
if (mode === 'null') { process.stdout.write('null'); process.exit(0); }
if (mode === 'sleep') await new Promise((resolve) => setTimeout(resolve, 10000));
if (mode === 'slow-valid') {
  await new Promise((resolve) => setTimeout(resolve, 250));
  process.stdout.write(execFileSync(process.argv[3], { input, encoding: 'utf8' }));
}
