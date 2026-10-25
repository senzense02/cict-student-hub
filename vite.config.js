// Build setup. The build id makes returning visitors notice a new deploy, and the two small plugins below
// fill in things that are only known after the build (the service worker's cache name, the font file names).
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// One id per deploy (the git commit on Vercel). The page compares its own id with /version.json
// to notice that a newer version exists, and the service worker cache is named after it.
const buildId = (process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36)).slice(0, 12);

// Stamps the build id into version.json and into sw.js. sw.js is copied from public/ untouched, so the
// id can only be filled in after the build has finished.
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

// Puts the two Latin font files in the page's <head> as preloads. Without this the browser only learns about the
// fonts after it has downloaded and read the stylesheet, so text appears late or jumps when the font swaps in.
// The file names carry a hash that changes per build, so they are read from the finished bundle. If the font
// package's naming ever changes this simply adds nothing.
function preloadFonts() {
  let base = '/';
  return {
    name: 'preload-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        return Object.keys(ctx.bundle || {})
          .filter((file) => /-latin-wght-normal[^/]*\.woff2$/.test(file))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${file}`, crossorigin: true },
            injectTo: 'head-prepend',
          }));
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), buildVersion(), preloadFonts()],
  define: { __BUILD_ID__: JSON.stringify(buildId) }, // lets the page know its own build id to compare with version.json
  build: {
    reportCompressedSize: false, // skips gzipping every file just to print its size: a faster build
    rollupOptions: {
      output: {
        // React rarely changes, so keeping it in its own file means a deploy that only touches the app's own code
        // leaves it in the browser's cache: returning visitors re-download only the small app files.
        manualChunks: { react: ['react', 'react-dom'] },
      },
    },
  },
  // Local development: forward /api to the Express server started by `npm run dev:api`
  server: { proxy: { '/api': 'http://localhost:5000' } },
});
