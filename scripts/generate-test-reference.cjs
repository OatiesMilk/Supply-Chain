#!/usr/bin/env node
// Read-only source extraction. Generated observations are not an approved OpenAPI schema.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const source = path.resolve(process.argv[2] || '.');
const out = path.resolve(process.argv[3] || 'docs/testing-reference');
const ts = require(require.resolve('typescript', { paths: [process.cwd(), path.join(source, 'client')] }));
const sha = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const dirty = cp.execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'client/src', 'server/src', 'client/tests', 'server/tests', 'e2e/tests'], { cwd: source, encoding: 'utf8' }).trim();
if (dirty) throw Error('Source/test inputs must be clean before generating a reference labelled with a commit SHA. Use a clean pinned checkout.');
const baseUrl = `https://github.com/OatiesMilk/Supply-Chain/blob/${sha}/`;
const writeMarkdown = (name, content) => fs.writeFileSync(path.join(out, name), content.split('\n').map(line=>line.trimEnd()).join('\n'));
const read = name => fs.readFileSync(path.join(source, name), 'utf8');
const parse = name => ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const index = parse('server/src/index.ts');
const mounts = new Map();
function visit(node, fn) { fn(node); ts.forEachChild(node, child => visit(child, fn)); }
const imports = new Map();
visit(index, node => {
  if (ts.isImportDeclaration(node) && node.importClause?.name) imports.set(node.importClause.name.text, node.moduleSpecifier.text);
});
visit(index, node => {
  if (ts.isCallExpression(node) && node.expression.getText(index) === 'app.use' && node.arguments.length === 2 && ts.isStringLiteral(node.arguments[0])) {
    const imported = imports.get(node.arguments[1].getText(index));
    if (imported?.startsWith('./routes/')) mounts.set(`server/src/${imported.slice(2)}.ts`, node.arguments[0].text);
  }
});
const endpoints = [];
for (const [file, prefix] of [...mounts, ['server/src/index.ts', '']]) {
  const sf = parse(file);
  visit(sf, node => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    const target = node.expression.expression.getText(sf), method = node.expression.name.text;
    if (!['router', 'app'].includes(target) || !['get', 'post', 'put', 'patch', 'delete'].includes(method)) return;
    if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0])) return;
    const route = node.arguments[0].text;
    if (target === 'app' && !route.startsWith('/api/')) return;
    const url = prefix + (route === '/' ? '' : route);
    const aliases = new Map([['req.body', 'body'], ['req.query', 'query'], ['req.params', 'params']]);
    const fields = { body: new Set(), query: new Set(), params: new Set() };
    const responses = [];
    const statuses = new Set();
    const trim = node => node.getText(sf);
    const findKind = node => { const text = trim(node); for (const [alias, kind] of aliases) if (text === alias || text.startsWith(alias + ' ??') || text.startsWith(alias + ' as')) return kind; };
    // Alias declarations may precede accesses in the same route callback.
    visit(node, child => {
      if (ts.isVariableDeclaration(child) && child.initializer) {
        const kind = findKind(child.initializer);
        if (kind && ts.isIdentifier(child.name)) aliases.set(child.name.text, kind);
        if (kind && ts.isObjectBindingPattern(child.name)) for (const el of child.name.elements) fields[kind].add(el.propertyName?.getText(sf) || el.name.getText(sf));
      }
    });
    visit(node, child => {
      if (ts.isPropertyAccessExpression(child)) {
        const kind = aliases.get(child.expression.getText(sf).replace(/\?/g, ''));
        if (kind) fields[kind].add(child.name.text);
      }
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === 'queryValue' && child.arguments[0] && ts.isStringLiteral(child.arguments[0])) fields.query.add(child.arguments[0].text);
      if (!ts.isCallExpression(child) || !ts.isPropertyAccessExpression(child.expression)) return;
      const expression = child.expression.expression.getText(sf);
      if (!/^res(?:\.|$)/.test(expression)) return;
      const action = child.expression.name.text;
      if (action === 'status') statuses.add(child.arguments[0]?.getText(sf));
      if (!['json', 'send', 'end', 'redirect'].includes(action)) return;
      const match = expression.match(/^res\.status\((.+)\)$/s);
      const status = match ? match[1] : action === 'redirect' ? '302' : '200';
      statuses.add(status);
      responses.push({ statusExpression: status, kind: action, payloadSource: child.arguments.map(trim).join(', '), line: sf.getLineAndCharacterOfPosition(child.getStart(sf)).line + 1 });
    });
    const guards = node.arguments.slice(1).filter(arg => !/async|=>|function/.test(arg.getText(sf))).map(trim);
    const entry = { method: method.toUpperCase(), path: url, file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, guards, observedRequestFields: Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,[...v].sort()])), statusExpressions: [...statuses].sort(), responses };
    endpoints.push(entry);
  });
}
endpoints.sort((a,b)=>a.path.localeCompare(b.path)||a.method.localeCompare(b.method));
if (new Set(endpoints.map(x=>x.method+' '+x.path)).size !== endpoints.length) throw Error('Duplicate endpoint key');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'endpoint-inventory.json'), JSON.stringify({ baseline: sha, repository: 'OatiesMilk/Supply-Chain', note: 'Static route observations, not JSON Schema, not complete middleware behavior, not runtime coverage. Read the handwritten contract and linked helpers. Variable status/payload expressions require helper/serializer inspection.', endpoints }, null, 2)+'\n');
let md = `# Endpoint catalog\n\nGenerated from merged baseline \`${sha}\`. All paths include \`/api\`.\n\nThis is **source evidence**, not an executable OpenAPI schema. Field reads do not establish requiredness or a strict whitelist. Local/imported validation helpers may read additional fields. Response snippets are TypeScript expressions, not example JSON. Default success statuses, shared middleware failures, binary streams, and helper-thrown errors must be interpreted using the handwritten contract and source.\n\n| Method | Path | Source |\n| --- | --- | --- |\n`;
for (const e of endpoints) md += `| ${e.method} | \`${e.path}\` | [${path.basename(e.file)}:${e.line}](${baseUrl}${e.file}#L${e.line}) |\n`;
for (const e of endpoints) {
  md += `\n## ${e.method} ${e.path}\n\nSource: [${e.file}:${e.line}](${baseUrl}${e.file}#L${e.line}).\n\nRoute middleware: ${e.guards.map(x=>'`'+x+'`').join(', ') || 'No explicit per-route middleware (global middleware still applies)'}.\n\n`;
  for (const [kind, fields] of Object.entries(e.observedRequestFields)) md += `${kind} fields observed in handler: ${fields.map(x=>'`'+x+'`').join(', ') || 'none statically resolved; inspect delegated helper if present'}.\n\n`;
  md += 'Response calls (includes errors and conditional status expressions):\n';
  if (!e.responses.length) md += '\nNo direct response call resolved; inspect the handler/helper and binary streaming behavior.\n';
  for (const r of e.responses) md += `\n- Status \`${r.statusExpression}\`, \`${r.kind}\`, line ${r.line}:\n\n\`\`\`ts\n${r.payloadSource || '// no response body'}\n\`\`\`\n`;
}
writeMarkdown('endpoint-catalog.md', md);
let dto = `# Client payload types and server serialization\n\nPinned merged source: \`${sha}\`. These are source declarations, not runtime validators. Server routes/serializers take precedence over permissive or outdated client types. Dates become JSON strings on the wire. \`unknown\`/\`any\` indicate a contract gap, not permission to assert arbitrary fields.\n`;
for (const file of ['client/src/api/index.ts', ...fs.readdirSync(path.join(source, 'client/src/types')).filter(name=>name.endsWith('.ts')).sort().map(name=>'client/src/types/'+name)]) {
  const sf = parse(file);
  dto += `\n## ${file}\n\n[Source](${baseUrl}${file}).\n`;
  for (const node of sf.statements) if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) dto += '\n```ts\n'+node.getText(sf)+'\n```\n';
}
for (const file of ['server/src/mappings.ts', 'server/src/routes/skus.ts', 'server/src/services/permissions.ts', 'server/src/services/deploymentStatus.ts', 'server/src/services/podStorage.ts']) {
  const sf = parse(file);
  for (const node of sf.statements) {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && ['DatabaseIdentity','PodStorageStatus'].includes(node.name.text)) dto += '\n```ts\n'+node.getText(sf)+'\n```\n';
    if (ts.isFunctionDeclaration(node) && ['serializeRecord','serializeProduct','permissionSnapshot','sessionUser','permissionEditor','deploymentStatus','podStorageStatus'].includes(node.name?.text)) dto += `\n## ${node.name.text}\n\n[Server source](${baseUrl}${file}#L${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1}).\n\n\`\`\`ts\n${node.getText(sf)}\n\`\`\`\n`;
  }
}
writeMarkdown('payload-types.md', dto);
const testFiles = [];
function scan(dir) { for (const name of fs.readdirSync(path.join(source, dir))) { const rel = `${dir}/${name}`; if (fs.statSync(path.join(source,rel)).isDirectory()) scan(rel); else if (/\.(test|spec)\.ts$/.test(name)) testFiles.push(rel); } }
for (const dir of ['client/tests','client/src/components/__tests__','client/src/utils','server/tests','e2e/tests']) scan(dir);
let tests = `# Existing test inventory\n\nPinned source: \`${sha}\`. Presence in this inventory is not proof of passing tests or full feature coverage. Some route tests replace Prisma with mocks; JSDOM is not a real browser and cannot verify layout. CI role Playwright suites use isolated PostgreSQL. No new execution evidence is asserted by this document.\n`;
for (const file of testFiles.sort()) {
  const sf = parse(file), titles = [];
  visit(sf, node => { if(ts.isCallExpression(node) && ['test','it','describe','test.describe'].includes(node.expression.getText(sf)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) titles.push(node.arguments[0].text); });
  tests += `\n## ${file}\n\n[Source](${baseUrl}${file}).\n\n`+ (titles.length ? titles.map(t=>'- '+t).join('\n') : 'Titles are dynamically defined or use other test helpers; inspect the file.')+'\n';
}
writeMarkdown('existing-tests.md', tests);
const casesPath = path.join(out, 'test-cases.json');
if (fs.existsSync(casesPath)) {
  const planning = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  if (planning.baseline !== sha) console.error('Planning baseline differs from extracted source; update the handwritten reference and case expectations before relying on the combined documents.');
  const cases = planning.cases;
  const cell = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const columns = ['id','title','module','profile','classification','priority','layers','roles','fixture','action','expected_result','side_effect_assertions','existing_test_files','execution_status'];
  const csv = value => '"'+String(Array.isArray(value) ? value.join('; ') : value).replace(/"/g,'""')+'"';
  fs.writeFileSync(path.join(out, 'test-cases.csv'), '\uFEFF'+[columns.map(csv).join(','), ...cases.map(row=>columns.map(key=>csv(row[key])).join(','))].join('\n')+'\n');
  let matrix = '# Test scenario matrix\n\nGenerated from [test-cases.json](test-cases.json). These are proposed cases, not newly executed tests. Use the stable row ID to locate its JSON entry and source/fixture details. `characterization-gap` means current behavior needs a business/engineering decision, not approval of that behavior. [CSV](test-cases.csv) is available for spreadsheet planning.\n';
  for (const module of new Set(cases.map(row=>row.module))) {
    matrix += `\n## ${module}\n\n| ID / profile | Layers / roles | Scenario and action | Expected result / effects |\n| --- | --- | --- | --- |\n`;
    for (const row of cases.filter(row=>row.module===module)) matrix += `| ${cell(row.id)} / ${cell(row.profile)} / ${cell(row.classification)} | ${cell(row.layers.join(', '))} / ${cell(row.roles.join(', '))} | **${cell(row.title || row.action)}**${row.title ? '<br>'+cell(row.action) : ''} | ${cell(row.expected_result)}<br>Effects: ${cell(row.side_effect_assertions)} |\n`;
  }
  writeMarkdown('test-case-matrix.md', matrix);
}
console.log(JSON.stringify({ baseline: sha, endpoints: endpoints.length, routeModules: mounts.size, testFiles: testFiles.length, output: out }));
