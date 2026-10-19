import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Local development: forward /api to the Express server started by `npm run dev:api`
  server: { proxy: { '/api': 'http://localhost:5000' } },
});
