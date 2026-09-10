import '../env.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/paguessr';

export const sql = postgres(connectionString, {
  max: Number(process.env.DB_MAX_CONNECTIONS || 10)
});

export const db = drizzle(sql, { schema });
