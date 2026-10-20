import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// One id per deploy (the git commit on Vercel). The page compares its own id with /version.json
// to notice that a newer version exists, and the service worker cache is named after it.
const buildId = (process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 12);

function buildVersion() {
  let outDir = 'dist';
  return {
    name: 'build-version',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: buildId }) });
    },
    closeBundle() {
      const sw = path.join(outDir, 'sw.js');
      if (fs.existsSync(sw)) fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replaceAll('__BUILD_ID__', buildId));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), buildVersion()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  // Local development: forward /api to the Express server started by `npm run dev:api`
  server: { proxy: { '/api': 'http://localhost:5000' } },
});
