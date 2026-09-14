import '../src/env.js';
import { sql } from '../src/db/index.js';
import { ensureLocations } from '../src/db/locationsBootstrap.js';

async function main() {
  const result = await ensureLocations();

  if (result.skipped && result.reason === 'ALREADY_POPULATED') {
    console.log('O banco já possui locais suficientes.');
    return;
  }
  if (result.skipped && result.reason === 'NO_API_KEY') {
    throw new Error('Configure GOOGLE_STREET_VIEW_API_KEY no .env.');
  }
  if (result.reason === 'API_ERROR') {
    throw new Error(
      `Não foi possível consultar o Street View: ${result.message || 'falha de conexão'}. Verifique a chave e a ativação da API no Google Cloud.`
    );
  }
  if (result.reason === 'INSUFFICIENT_PANORAMAS') {
    throw new Error('Não foram encontrados 5 panoramas válidos. Execute a varredura de cobertura.');
  }

  console.log(`Locais disponíveis: ${result.total}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falha ao cadastrar locais.');
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 1 }));
