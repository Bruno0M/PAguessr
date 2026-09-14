import '../src/env.js';
import { sql } from '../src/db/index.js';
import { runCoverage } from '../src/streetview.js';

export * from '../src/streetview.js';

if (process.argv[1]?.endsWith('coverage.ts')) {
  runCoverage()
    .then(async () => {
      await sql.end({ timeout: 1 });
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Falha na execução do script de cobertura:', err);
      await sql.end({ timeout: 1 }).catch(() => {});
      process.exit(1);
    });
}
