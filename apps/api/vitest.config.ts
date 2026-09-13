import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scripts operacionais (sobem o servidor, rodam migração ou chamam a API
      // real do Google) ficam fora do piso de cobertura — não são testáveis
      // como unidade sem tocar rede ou processo, e testá-los aqui abriria
      // exatamente o risco de chamada real que queremos evitar.
      exclude: [
        'coverage/**',
        'dist/**',
        'drizzle/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/index.ts',
        'src/db/migrate.ts',
        'src/db/seed.ts',
        'src/test/**',
        'scripts/bootstrap-locations.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
