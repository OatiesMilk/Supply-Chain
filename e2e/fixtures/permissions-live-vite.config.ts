import { defineConfig } from 'vite';
import path from 'node:path';

const port = Number(process.env.PERMISSION_LIVE_FRONTEND_PORT || 3000);
const apiPort = Number(process.env.PERMISSION_LIVE_API_PORT || 4000);
if (![[3000, 4000], [3001, 4001]].some(pair => pair[0] === port && pair[1] === apiPort)) throw new Error('Unsupported isolated test port pair');
export default defineConfig({
  root: path.resolve(__dirname, '../../client'),
  preview: { host: '127.0.0.1', port, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } } },
});
