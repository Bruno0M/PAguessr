import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../env.js';

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/paguessr';

export async function runMigrations() {
  const maxRetries = 20;
  let client: ReturnType<typeof postgres> | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      client = postgres(connectionString, { max: 1 });
      await client`SELECT 1`;
      break;
    } catch (err) {
      if (client) {
        await client.end({ timeout: 1 }).catch(() => {});
      }
      if (attempt === maxRetries) {
        throw err;
      }
      console.log(`Aguardando banco de dados (tentativa ${attempt}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (!client) {
    throw new Error('Não foi possível conectar ao banco de dados');
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(currentDir, '../../drizzle');

  console.log(`Aplicando migrações a partir de ${migrationsFolder}...`);
  const migrationDb = drizzle(client);
  await migrate(migrationDb, { migrationsFolder });
  await client.end();
  console.log('Migrações aplicadas com sucesso.');
}

runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Falha ao aplicar migrações:', err);
    process.exit(1);
  });
