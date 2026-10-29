/** Production preview for a frozen source tree and dedicated multiplayer server. */
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const apiPort = Number(process.env.STRAHOV_PERF_API_PORT || 2570);
const port = Number(process.env.STRAHOV_PERF_PREVIEW_PORT || 4175);
if (apiPort === 2567 || port === 5173) throw new Error('Use isolated audit ports.');
// Optional recorded weather keeps A/B renders comparable without changing the
// production bundle or server. Its visible source explicitly identifies QA.
const fixturePath = process.env.STRAHOV_PERF_WEATHER_FIXTURE;
let fixture;
if (fixturePath) {
  const bytes = await readFile(fixturePath);
  const weather = JSON.parse(bytes);
  for (const key of ['temperature', 'cloud', 'rain', 'wind', 'windDirection'])
    if (!Number.isFinite(weather[key])) throw new Error('Invalid weather fixture: ' + key);
  fixture = JSON.stringify({ ...weather, status: 'fallback',
    source: 'Řízené testovací počasí · uložený záznam',
    cloudSource: 'Řízený meteorologický model · benchmark',
    cloudWindSource: 'Řízené modelové proudění · benchmark',
  });
  console.log('Weather fixture SHA-256: ' + createHash('sha256').update(bytes).digest('hex'));
}
await preview({
  root: process.cwd(), configFile: false,
  plugins: fixture ? [{ name: 'recorded-audit-weather', configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== '/api/weather') return next();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(fixture);
    });
  } }] : [],
  preview: { host: '127.0.0.1', port, strictPort: true, proxy: {
    '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    '/realtime': { target: `http://127.0.0.1:${apiPort}`, ws: true, rewrite: path => path.replace(/^\/realtime/, '') },
  } },
});
console.log(`Frozen production preview: http://127.0.0.1:${port}; isolated API ${apiPort}`);
