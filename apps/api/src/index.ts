import './env.js';
import { buildApp } from './app.js';
import { sql } from './db/index.js';
import { ensureLocations } from './db/locationsBootstrap.js';

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

// Roda em segundo plano, sem atrasar o boot: se o banco ainda não tem locais
// (deploy novo, migration em base limpa), popula via Street View Metadata API
// automaticamente. Nunca derruba o servidor — sem chave configurada ou com a
// API fora do ar, a API sobe normalmente e só a criação de partida (POST
// /games) segue bloqueada até alguém corrigir a chave.
ensureLocations()
  .then((result) => {
    if (result.skipped && result.reason === 'ALREADY_POPULATED') return;
    if (result.skipped && result.reason === 'NO_API_KEY') {
      app.log.warn(
        'GOOGLE_STREET_VIEW_API_KEY/GOOGLE_MAPS_API_KEY não configurada: locais não importados automaticamente.'
      );
      return;
    }
    if (result.reason === 'API_ERROR') {
      app.log.error(
        { message: result.message },
        'Falha ao consultar o Street View ao importar locais automaticamente.'
      );
      return;
    }
    if (result.reason === 'INSUFFICIENT_PANORAMAS') {
      app.log.warn(
        `Apenas ${result.total} locais válidos encontrados (mínimo 5). Execute "pnpm coverage" para uma varredura completa.`
      );
      return;
    }
    app.log.info(`Importação automática de locais concluída: ${result.total} locais disponíveis.`);
  })
  .catch((err) => {
    app.log.error({ err }, 'Erro inesperado ao importar locais automaticamente.');
  });
