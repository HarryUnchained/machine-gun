import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    alias: {
      '@machine-gun/common': path.resolve(__dirname, '../../packages/common/src/index.ts'),
    },
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly enable decorator support for NestJS
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
