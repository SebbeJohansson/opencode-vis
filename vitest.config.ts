import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    // Pure modules run in node; a test opts into the Nuxt runtime with
    // `// @vitest-environment nuxt` at the top of the file.
    environment: 'node',
    include: ['app/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.nuxt', '.output'],
    environmentOptions: {
      nuxt: { domEnvironment: 'happy-dom' },
    },
  },
});
