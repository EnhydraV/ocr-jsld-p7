import { defineConfig } from 'vitest/config';

// Seuil de couverture exigé sur le périmètre métier (cf. plan de testing, DOCUMENTATION §4.3)
const businessThreshold = {
  statements: 80,
  branches: 80,
  functions: 80,
  lines: 80,
};

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Base SQLite jetable, préparée par globalSetup et détruite en fin de suite
    env: {
      DATABASE_URL: 'file:./test.db',
    },
    globalSetup: './src/tests/globalSetup.ts',
    // Les tests d'intégration partagent la même base : pas de parallélisme entre fichiers
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/tests/**'],
      thresholds: {
        'src/services/**/*.ts': businessThreshold,
        'src/repositories/**/*.ts': businessThreshold,
        'src/models/**/*.ts': businessThreshold,
      },
    },
  },
});
