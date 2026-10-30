// Bind the unmodified real API entry point to localhost for this isolated run.
// No deployed settings or application environment files are read or changed.
const net = require('node:net');
const url = new URL(process.env.PERMISSION_LIVE_DATABASE_URL || 'invalid:');
if (url.protocol !== 'postgresql:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
  || url.pathname !== '/gh250_live_test' || url.search || url.hash) {
  throw new Error('The live workflow server requires the explicitly isolated gh250_live_test database');
}
process.env.DATABASE_URL = url.toString();
process.env.PERMISSION_MODE = 'V1';
process.env.NODE_ENV = 'test';
const frontendPort = Number(process.env.PERMISSION_LIVE_FRONTEND_PORT || 3000);
const apiPort = Number(process.env.PERMISSION_LIVE_API_PORT || 4000);
if (![[3000, 4000], [3001, 4001]].some(pair => pair[0] === frontendPort && pair[1] === apiPort)) throw new Error('Unsupported isolated test port pair');
process.env.PORT = String(apiPort);
process.env.CLIENT_ORIGIN = `http://127.0.0.1:${frontendPort}`;
process.env.APP_URL = process.env.CLIENT_ORIGIN;
process.env.JWT_SECRET = 'GH250-synthetic-local-only-signing-secret';
for (const key of Object.keys(process.env)) if (/^(AZURE_|SMTP_|SUPABASE_)/.test(key) || key === 'RENDER_EXTERNAL_URL') delete process.env[key];
process.env.POD_STORAGE_PROVIDER = 'local';
process.env.POD_UPLOAD_DIR = require('node:path').resolve(__dirname, '../test-results/permissions-live-uploads');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (port, ...args) {
  return typeof port === 'number' ? listen.call(this, port, '127.0.0.1', ...args) : listen.call(this, port, ...args);
};
import('../../server/src/index.ts');
