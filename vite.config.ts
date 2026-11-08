/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1' },
  // duas páginas: a planta virtual (index.html) e o painel de pedidos (painel.html)
  build: { rollupOptions: { input: { planta: 'index.html', painel: 'painel.html' } } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
