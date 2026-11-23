import { defineConfig } from 'vite';

// 상대 경로 base: GitHub Pages 의 하위 경로에서도 동작한다.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
