const fs = require('node:fs');
const path = require('node:path');

function discover(root, layer) {
  const dir = path.join(root, 'e2e', layer);
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.test.ts') && name !== 'sso-session.test.ts').sort();
  if (!files.length) throw new Error(`No test files found for ${layer}`);
  return files.map(name => path.join(dir, name));
}
function parseResult(proc) {
  const output = proc.stdout || '';
  const counts = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = output.match(new RegExp(`^# ${key} (\\d+)\\s*$`, 'm'));
    if (match) counts[key] = Number(match[1]);
  }
  const complete = Object.keys(counts).length === 6 && counts.tests > 0 &&
    counts.tests === counts.pass + counts.fail + counts.cancelled + counts.skipped + counts.todo;
  const executionError = !!proc.error || proc.signal != null || proc.status == null || !complete ||
    (proc.status !== 0 && counts.fail === 0 && counts.cancelled === 0);
  return { ...counts, executionError,
    status: executionError ? 'ERROR' : counts.fail || counts.cancelled || proc.status !== 0 ? 'FAIL' : counts.skipped || counts.todo ? 'INCOMPLETE' : 'PASS' };
}
function overall(results) {
  if (!results.length || results.some(result => result.status === 'ERROR')) return 'ERROR';
  if (results.some(result => result.status === 'BLOCKED')) return 'BLOCKED';
  if (results.some(result => result.status === 'FAIL')) return 'FAIL';
  if (results.some(result => result.status !== 'PASS')) return 'INCOMPLETE';
  return 'PASS';
}
module.exports = { discover, parseResult, overall };
