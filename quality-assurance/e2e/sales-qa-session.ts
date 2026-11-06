import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, expect, WEB_BASE } from './helpers/browser';
import { artifactDir, evidence, redact, runId, manilaToday } from './helpers/runtime';

const results: any[] = [];
let current = 'preflight';
let step = 0;
const started = new Date().toISOString();
console.log(`Starting Sales Coordinator QA session ${runId()}`);
awaitSession().catch(error => { console.error(redact(error instanceof Error ? error.message : error)); process.exitCode = 1; });
async function awaitSession() {
  await withBrowser('SC-QA', async ({ pageFor }) => {
    const page = await pageFor('microsoft');
    const state: Record<string, any> = { navigate: async (route: string) => {
      if (route.includes('://') || route.startsWith('/') || route.includes('\\')) throw new Error('Only portal route keys allowed');
      await page.goto(`${WEB_BASE}/${route}`);
      await expect(page.getByRole('navigation')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/Checking your session|Loading view/);
    } };
    const screenshot = async (caption: string) => {
      const name = `${current}-${String(++step).padStart(2, '0')}-${caption}.png`;
      await page.screenshot({ path: path.join(artifactDir(), name), fullPage: true });
      return name;
    };
    const api = async (method: string, endpoint: string, body?: unknown) => {
      if (!endpoint.startsWith('/') || endpoint.includes('://') || endpoint.startsWith('//') || endpoint.includes('\\')) throw new Error('Only local relative API paths allowed');
      if (method !== 'GET') throw new Error('This QA session is read-only; mutations are blocked');
      const result = await page.evaluate(async ({ method, endpoint, body }) => {
        const csrfResponse = method === 'GET' ? null : await fetch('/api/v1/auth/me');
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        const csrf = csrfResponse?.headers.get('X-CSRF-Token');
        if (csrf) headers['X-CSRF-Token'] = csrf;
        const response = await fetch(`/api/v1${endpoint}`, { method, redirect: 'error', headers,
          body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        const text = await response.text();
        return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
      }, { method, endpoint, body });
      evidence(`${current}-${String(++step).padStart(2,'0')}-api.json`, { method, endpoint, ...result });
      return result;
    };
    console.log('QA_SESSION_READY: authenticated Sales Coordinator session retained in memory.');
    const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of input) {
      let command: any;
      try { command = JSON.parse(line); } catch { console.log('Invalid QA command'); continue; }
      if (command.op === 'close') break;
      if (command.op === 'inspect') {
        try {
          const fn = new Function('page', 'expect', 'api', 'state', 'screenshot', 'today', 'base', `return (async () => { ${command.code} })()`);
          console.log(redact({ inspection: await fn(page, expect, api, state, screenshot, manilaToday(), WEB_BASE) }));
        } catch (error) { console.log(redact({ inspectionError: error instanceof Error ? error.message : error })); }
        continue;
      }
      current = command.id; step = 0;
      if (!/^[A-Z0-9-]+$/.test(current)) throw new Error('Invalid case ID');
      const at = new Date().toISOString();
      await page.context().tracing.startChunk({ title: current });
      let result: any;
      try {
        const fn = new Function('page', 'expect', 'api', 'state', 'screenshot', 'today', 'base', `return (async () => { ${command.code} })()`);
        const actual = await fn(page, expect, api, state, screenshot, manilaToday(), WEB_BASE);
        const shot = await screenshot('result');
        result = { id: current, title: command.title, coverage: command.coverage ?? 'focused check', status: 'Pass', at, actual, screenshot: shot };
      } catch (error) {
        const shot = await screenshot('failure').catch(() => undefined);
        result = { id: current, title: command.title, coverage: command.coverage ?? 'focused check', status: 'Fail', at, actual: error instanceof Error ? error.message : String(error), screenshot: shot };
      }
      await page.context().tracing.stopChunk({ path: path.join(artifactDir(), `${current}-actions.zip`) });
      results.push(result);
      evidence('sales-results.json', { started, results });
      console.log(redact(result));
    }
    input.close();
    evidence('sales-results.json', { started, ended: new Date().toISOString(), results });
  });
}
