import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const APP_VERSION = process.env.npm_package_version ?? 'dev';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  build: {
    target: 'es2022',
    // El chunk de Firebase (~600 kB, 184 kB gzip) se cachea aparte; es el mismo tamaño que en CRYPTICUS.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          if (id.includes('node_modules/katex')) return 'katex';
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
