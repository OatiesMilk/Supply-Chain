import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { PassThrough } from 'node:stream';
import AccessRequestModal, { copyAccessRequestText } from '../src/components/AccessRequestModal';

function renderToString(element: React.ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', chunk => chunks.push(Buffer.from(chunk)));
    output.on('end', () => resolve(Buffer.concat(chunks).toString()));
    const stream = renderToPipeableStream(element, {
      onAllReady() { stream.pipe(output); },
      onError: reject,
    });
  });
}

test('AccessRequestModal renders honest request instructions and copy button without fake sent claims', async () => {
  const html = await renderToString(
    React.createElement(AccessRequestModal, {
      isOpen: true,
      onClose: () => {},
      screenName: 'RMA',
      currentUserRole: 'SALES_COORDINATOR',
    })
  );

  assert.ok(html.includes('Request Temporary Access'), 'shows title');
  assert.ok(html.includes('Copy Request Details'), 'has honest copy button');
  assert.ok(!html.includes('Your admin has been notified.'), 'does not make false claims');
});

test('copyAccessRequestText reports clipboard success, rejection, and unavailability honestly', async () => {
  assert.equal(await copyAccessRequestText('Access Request', { writeText: async () => {} }), true);
  assert.equal(await copyAccessRequestText('Access Request', { writeText: async () => { throw new Error('Permission denied'); } }), false);
  assert.equal(await copyAccessRequestText('Access Request', null), false);
  assert.equal(await copyAccessRequestText('Access Request', {}), false);
});
