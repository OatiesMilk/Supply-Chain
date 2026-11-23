import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

test('client/index.html does not reference external Google Fonts hosts blocked by strict CSP', () => {
  const html = fs.readFileSync(path.join(clientRoot, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /fonts\.googleapis\.com/i);
  assert.doesNotMatch(html, /fonts\.gstatic\.com/i);
});

test('client/src/main.tsx imports self-hosted Inter weights 400-700 before index.css', () => {
  const mainTsx = fs.readFileSync(path.join(clientRoot, 'src', 'main.tsx'), 'utf8');
  const indexCssPos = mainTsx.indexOf("import './index.css'");
  assert.ok(indexCssPos > -1, 'main.tsx must import ./index.css');

  for (const weight of [400, 500, 600, 700]) {
    const specifier = `import '@fontsource/inter/${weight}.css'`;
    const pos = mainTsx.indexOf(specifier);
    assert.ok(pos > -1, `main.tsx must import ${specifier}`);
    assert.ok(pos < indexCssPos, `${specifier} must appear before ./index.css`);
  }
});

test('client/src/index.css configures Inter matching @fontsource/inter font-family', () => {
  const indexCss = fs.readFileSync(path.join(clientRoot, 'src', 'index.css'), 'utf8');
  assert.match(indexCss, /--font-sans:\s*"Inter",/);
  assert.match(indexCss, /--font-mono:\s*"Inter",/);

  for (const weight of [400, 500, 600, 700]) {
    const fontCssPath = require.resolve(`@fontsource/inter/${weight}.css`);
    const fontCss = fs.readFileSync(fontCssPath, 'utf8');
    assert.match(fontCss, /font-family:\s*'Inter';/);
    assert.match(fontCss, new RegExp(`font-weight:\\s*${weight};`));
    assert.match(fontCss, /font-display:\s*swap;/);
  }
});
