import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { QA_ROOT, REPO_ROOT, ROLE_CONFIG, apiBase, assertWriteTarget, redact, manilaToday } from '../e2e/helpers/runtime';
const { discover, parseResult, overall } = require('./runner-core.cjs');

async function main() {
  const layerArg = process.argv.find(arg => arg.startsWith('--layer='))?.split('=')[1] ?? 'all';
  if (!['unit', 'api', 'browser', 'all'].includes(layerArg)) throw new Error('Use --layer=unit|api|browser|all');
  const sso = process.argv.includes('--sso');
  if (sso && layerArg !== 'browser') throw new Error('--sso requires --layer=browser');
  if (sso) process.env.UAT_AUTH_MODE = 'microsoft';
  const day = manilaToday().replaceAll('-', '');
  const existing = [...fs.readdirSync(path.join(QA_ROOT, 'artifacts')), ...fs.readdirSync(path.join(QA_ROOT, '04-execution'))];
  const numbers = existing.map(name => name.match(new RegExp(`^RUN-${day}-(\\d+)$`))).filter(Boolean).map(match => Number(match![1]));
  let number = Math.max(0, ...numbers) + 1;
  let id: string;
  let artifacts: string;
  for (;;) {
    id = `RUN-${day}-${String(number).padStart(2, '0')}`;
    artifacts = path.join(QA_ROOT, 'artifacts', id);
    try { fs.mkdirSync(artifacts); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; number++; }
  }
  process.env.UAT_RUN_ID = id;
  const execution = path.join(QA_ROOT, '04-execution', id);
  fs.mkdirSync(execution, { recursive: true });
  const layers = layerArg === 'all' ? ['unit', 'api', 'browser'] : [layerArg];
  const results: any[] = [];
  const revision = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout?.trim() ?? 'unknown';
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout?.trim() ?? 'unknown';
  for (const layer of layers) {
    let files: string[];
    try {
      files = sso ? [path.join(QA_ROOT, 'e2e/browser/sso-session.test.ts')] : discover(QA_ROOT, layer);
      if (layer !== 'unit') {
        apiBase();
        if (sso) {
          if (!process.env.UAT_MICROSOFT_EMAIL) throw new Error('Set UAT_MICROSOFT_EMAIL for the interactive account');
        } else {
          const missing = Object.values(ROLE_CONFIG).map(([, variable]) => variable).filter(variable => !process.env[variable]);
          if (missing.length) throw new Error(`Missing runtime variables: ${missing.join(', ')}`);
          assertWriteTarget();
        }
        if (layer === 'browser') require.resolve('@playwright/test', { paths: [path.join(QA_ROOT, 'e2e')] });
        const health = await fetch(`${apiBase()}/health`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
        if (health.status !== 200) throw new Error(`API health returned HTTP ${health.status}`);
      }
    } catch (error) {
      const reason = redact(error instanceof Error ? error.message : error);
      results.push({ file: layer, status: 'BLOCKED', reason });
      console.log(`${layer}: BLOCKED — ${reason}`);
      continue;
    }
    for (const [index, file] of files.entries()) {
      const suiteId = `${layer}-${index + 1}`;
      console.log(`Running ${path.relative(QA_ROOT, file)}`);
      // Direct file execution preserves registered node:test subtests on Node 20+
      // and avoids treating a transpiled file wrapper as the only passing test.
      const proc = spawnSync(process.execPath, ['--import', 'tsx', '--test-reporter=tap', file], {
        cwd: REPO_ROOT, encoding: 'utf8', timeout: sso ? 700000 : 180000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, UAT_SUITE_ID: suiteId },
      });
      const result = { file: path.relative(QA_ROOT, file), ...parseResult(proc), reason: proc.error ? `Process error: ${(proc.error as NodeJS.ErrnoException).code ?? proc.error.name}` : undefined };
      fs.writeFileSync(path.join(artifacts, `${suiteId}.tap`), redact(proc.stdout ?? ''));
      fs.writeFileSync(path.join(artifacts, `${suiteId}-stderr.txt`), redact(proc.stderr ?? ''));
      results.push(result);
      console.log(`${result.status}: ${result.pass ?? 0} passed, ${result.fail ?? 0} failed`);
    }
  }
  const status = overall(results);
  const sum = (field: string) => results.reduce((total, result) => total + (result[field] ?? 0), 0);
  const total = sum('tests');
  const passRate = total ? `${(100 * sum('pass') / total).toFixed(1)}%` : 'N/A';
  const rows = results.map(result => `| ${result.file} | ${result.status} | ${result.tests ?? '—'} | ${result.pass ?? '—'} | ${result.fail ?? '—'} | ${result.reason ?? ''} |`).join('\n');
  const report = `# Automated QA results: ${id}\n\nStatus: **${status}**\n\nBuild: ${revision}; branch: ${branch}; working tree (including uncommitted tests).\nTime: ${new Date().toISOString()}; Manila day: ${manilaToday()}.\nRequested scope: ${sso ? 'interactive Microsoft account smoke only' : layerArg}.\n\nTests: ${total}; passed: ${sum('pass')}; failed: ${sum('fail')}; cancelled: ${sum('cancelled')}; skipped: ${sum('skipped')}; todo: ${sum('todo')}; pass rate: ${passRate}.\n\n| File/layer | Status | Tests | Pass | Fail | Blocker |\n|---|---|---:|---:|---:|---|\n${rows}\n\nThis is automated regression evidence, not full UAT sign-off. Unselected layers and requirements not asserted by these tests are not verified. Existing defects remain open until their exact acceptance criteria are retested.\n\n[Evidence index](../artifacts/${id}/index.md)\n`;
  fs.writeFileSync(path.join(QA_ROOT, '06-reports', `automated-${id}.md`), report);
  fs.writeFileSync(path.join(execution, 'execution-log.md'), report.replace(`[Evidence index](../artifacts/`, `[Evidence index](../../artifacts/`));
  fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ id, status, revision, branch, results }, null, 2));
  const entries = fs.readdirSync(artifacts).filter(name => name !== 'index.md').sort();
  fs.writeFileSync(path.join(artifacts, 'index.md'), `# Evidence: ${id}\n\n` + entries.map(name => `- [${name}](${name})`).join('\n') + '\n');
  console.log(`Report: quality-assurance/06-reports/automated-${id}.md`);
  process.exitCode = status === 'PASS' ? 0 : status === 'BLOCKED' ? 2 : 1;
}
main().catch(error => { console.error(redact(error instanceof Error ? error.message : error)); process.exitCode = 1; });
