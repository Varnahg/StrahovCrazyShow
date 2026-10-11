/** Production preview for a frozen source tree and dedicated multiplayer server. */
import { preview } from 'vite';
const apiPort = Number(process.env.STRAHOV_PERF_API_PORT || 2570);
const port = Number(process.env.STRAHOV_PERF_PREVIEW_PORT || 4175);
if (apiPort === 2567 || port === 5173) throw new Error('Use isolated audit ports.');
await preview({
  root: process.cwd(), configFile: false,
  preview: { host: '127.0.0.1', port, strictPort: true, proxy: {
    '/api': `http://127.0.0.1:${apiPort}`,
    '/realtime': { target: `http://127.0.0.1:${apiPort}`, ws: true, rewrite: path => path.replace(/^\/realtime/, '') },
  } },
});
console.log(`Frozen production preview: http://127.0.0.1:${port}; isolated API ${apiPort}`);
