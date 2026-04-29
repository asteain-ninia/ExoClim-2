import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // ExoClim 専用ポート（他プロジェクトとの衝突回避）
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
});
