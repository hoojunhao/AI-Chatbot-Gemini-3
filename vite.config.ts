import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Explicitly load env from current working directory
  const env = loadEnv(mode, process.cwd(), '');

  // Debug logging to see if key is loaded (masked for security)
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
  if (apiKey) {
    console.log('✅ GEMINI_API_KEY found in environment (length: ' + apiKey.length + ')');
  } else {
    console.warn('⚠️ GEMINI_API_KEY NOT found in environment!');
    console.log('Checked paths:', process.cwd());
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      // Ensure we handle missing keys gracefully
      // (Optional) If you still have other process.env usages, keep them, otherwise this can be removed or minimized.
      // For now, we'll leaving it empty or just removing the API_KEYs.
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
