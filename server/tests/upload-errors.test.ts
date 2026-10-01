import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { uploadErrorHandler } from '../src/middleware/uploadErrors';
import { podUpload } from '../src/services/podStorage';

const app = express();
app.post('/upload', podUpload.single('file'), (_req, res) => res.status(201).json({ ok: true }));
app.use(uploadErrorHandler);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error.message });
});

const server = app.listen(0, '127.0.0.1');
const serverReady = new Promise<void>(resolve => server.on('listening', resolve));
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function postFile(name: string, type: string, size: number) {
  await serverReady;
  const address = server.address() as { port: number };
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(size)], { type }), name);
  return fetch(`http://127.0.0.1:${address.port}/upload`, { method: 'POST', body: form });
}

test('PDF, JPG, JPEG, PNG, and DOC uploads with matching MIME types are accepted', async () => {
  const allowed = [
    ['file.pdf', 'application/pdf'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['document.doc', 'application/msword'],
  ];

  for (const [name, type] of allowed) {
    const response = await postFile(name, type, 32);
    assert.equal(response.status, 201, `${name} should be accepted`);
  }
});

test('unsupported formats and extension/MIME mismatches return actionable 400 responses', async () => {
  const rejected = [
    ['payload.exe', 'application/x-msdownload'],
    ['document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['spreadsheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['file.pdf', 'image/jpeg'],
    ['photo.png', 'application/pdf'],
  ];

  for (const [name, type] of rejected) {
    const response = await postFile(name, type, 32);
    assert.equal(response.status, 400, `${name} (${type}) should be rejected`);
    assert.deepEqual(await response.json(), {
      error: 'Unsupported file type. Allowed formats: PDF, JPG, PNG, and DOC.',
    });
  }
});

test('uploads larger than 10 MB return an actionable 413 response through Multer', async () => {
  const response = await postFile('large.pdf', 'application/pdf', 10 * 1024 * 1024 + 1);

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: 'File is too large. The maximum upload size is 10 MB.',
  });
});

test('an upload exactly 10 MiB is accepted', async () => {
  const response = await postFile('limit.pdf', 'application/pdf', 10 * 1024 * 1024);

  assert.equal(response.status, 201);
});
