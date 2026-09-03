import { execSync } from 'node:child_process';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const gitRevision = execSync('git rev-parse --short HEAD').toString().trim();

const PROXY_PORT = process.env.CLAUDE_PROXY_PORT;
const proxyTarget = PROXY_PORT ? `http://localhost:${PROXY_PORT}` : undefined;

export default defineConfig({
  base: './',
  root: 'app',
  plugins: [vue()],
  worker: {
    format: 'es',
  },
  define: {
    __GIT_REVISION__: JSON.stringify(gitRevision),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  ...(proxyTarget && {
    server: {
      proxy: {
        // Only /api/config needs proxying — everything else goes directly to OpenCode or Claude sidecar
        '/api/config': { target: proxyTarget, changeOrigin: true },
      },
    },
  }),
});
