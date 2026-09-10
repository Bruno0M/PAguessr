import './env.js';
import { buildApp } from './app.js';
import { sql } from './db/index.js';

const app = buildApp();
const port = Number(process.env.PORT || 3333);
const host = process.env.HOST || '0.0.0.0';

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Recebido ${signal}, encerrando servidor...`);
    await app.close();
    await sql.end();
    process.exit(0);
  });
}

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
