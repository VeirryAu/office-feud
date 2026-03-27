import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        admin: resolve(__dirname, 'admin.html'),
        public: resolve(__dirname, 'public.html'),
      },
    },
  },
});
