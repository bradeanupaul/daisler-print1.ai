import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
      'process.env.OPENAI_IMAGE_MODEL': JSON.stringify(env.OPENAI_IMAGE_MODEL || ''),
      'process.env.OPENAI_IMAGE_QUALITY': JSON.stringify(env.OPENAI_IMAGE_QUALITY || ''),
      'process.env.OPENAI_IMAGE_MAX_PASSES': JSON.stringify(env.OPENAI_IMAGE_MAX_PASSES || ''),
      'process.env.OPENAI_IMAGE_CRITIQUE': JSON.stringify(env.OPENAI_IMAGE_CRITIQUE || ''),
      'process.env.GEMINI_IMAGE_MODEL': JSON.stringify(env.GEMINI_IMAGE_MODEL || ''),
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
