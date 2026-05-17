import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  /** Fișiere .env* (local). Pe Vercel, variabilele din dashboard sunt în `process.env` la build. */
  const fromFiles = loadEnv(mode, '.', '');
  const pick = (key: string) => (fromFiles[key] ?? process.env[key] ?? '').trim();

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(pick('GEMINI_API_KEY')),
      'process.env.API_KEY': JSON.stringify(pick('API_KEY')),
      'process.env.OPENAI_API_KEY': JSON.stringify(pick('OPENAI_API_KEY')),
      'process.env.OPENAI_IMAGE_MODEL': JSON.stringify(pick('OPENAI_IMAGE_MODEL')),
      'process.env.OPENAI_IMAGE_QUALITY': JSON.stringify(pick('OPENAI_IMAGE_QUALITY')),
      'process.env.OPENAI_IMAGE_MAX_PASSES': JSON.stringify(pick('OPENAI_IMAGE_MAX_PASSES')),
      'process.env.OPENAI_IMAGE_CRITIQUE': JSON.stringify(pick('OPENAI_IMAGE_CRITIQUE')),
      'process.env.GEMINI_IMAGE_MODEL': JSON.stringify(pick('GEMINI_IMAGE_MODEL')),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
