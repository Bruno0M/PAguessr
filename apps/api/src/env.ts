import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// O Vitest expõe VITEST=true em qualquer execução de teste. Nesses casos
// carregamos .env.test em vez de .env, para nunca encostar no banco de
// desenvolvimento (que pode ter locais reais coletados via `pnpm coverage`).
// process.env definido antes deste ponto (ex.: pela CI) sempre tem prioridade,
// porque dotenv não sobrescreve variáveis já existentes.
const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const envFile = isTest ? '.env.test' : '.env';

dotenv.config({
  path: [
    path.resolve(process.cwd(), envFile),
    path.resolve(currentDir, `../../../${envFile}`),
    path.resolve(currentDir, `../../${envFile}`),
  ],
});
