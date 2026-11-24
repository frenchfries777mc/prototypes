import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 모든 JS/CSS/데이터를 HTML 한 파일에 넣는다.
export default defineConfig({
  plugins: [viteSingleFile()],
  publicDir: false,
  build: { outDir: 'dist-single', emptyOutDir: true, rollupOptions: { input: 'standalone.html' }, chunkSizeWarningLimit: 10000 },
});
