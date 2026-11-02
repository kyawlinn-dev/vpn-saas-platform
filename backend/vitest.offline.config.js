import { configDefaults, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';
import { fileURLToPath } from 'node:url';

export default mergeConfig(base, { test: { maxWorkers: 2, minWorkers: 1,
  // Embedded Postgres scenarios run as standalone Node programs with PGLite,
  // not through vite-node's module loader. Keep them in the explicit SQL gate.
  exclude: [...configDefaults.exclude, 'src/__tests__/database/**/*.mjs'],
  setupFiles: [fileURLToPath(new URL('./src/__tests__/helpers/offlineNetwork.js', import.meta.url))] } });
