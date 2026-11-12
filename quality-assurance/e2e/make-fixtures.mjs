import { chromium } from '@playwright/test';
import { Document, Packer, Paragraph } from 'docx';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.join(import.meta.dirname, 'fixtures');
await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.setContent('<!doctype html><html><body style="margin:0;background:#8db7df;width:64px;height:64px"></body></html>');
  await page.screenshot({ path: path.join(dir, 'uat-photo.png'), type: 'png' });
  await page.screenshot({ path: path.join(dir, 'uat-photo.jpg'), type: 'jpeg', quality: 85 });
  await page.setContent('<!doctype html><html><body><p>UAT document</p></body></html>');
  await page.pdf({ path: path.join(dir, 'uat-doc.pdf'), format: 'A4' });
} finally {
  await browser.close();
}

const doc = new Document({ sections: [{ children: [new Paragraph('UAT document')] }] });
await writeFile(path.join(dir, 'uat-doc.docx'), await Packer.toBuffer(doc));
await writeFile(path.join(dir, 'uat-note.txt'), 'UAT note');
await writeFile(path.join(dir, 'uat-fake.jpg'), 'not an image');
await writeFile(path.join(dir, 'uat-big.pdf'), Buffer.alloc(11 * 1024 * 1024, 0x55));
console.log('Fixtures generated.');
