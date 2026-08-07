import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, le front tourne sur son propre port et parle à l'API
// démarrée à côté (npm run dev:api). En production il n'y a qu'un port :
// le serveur Express sert client/dist.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4173',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
