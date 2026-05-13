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
    swc.vite({
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
