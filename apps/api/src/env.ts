import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [
    path.resolve(process.cwd(), '.env'),
    path.resolve(currentDir, '../../../.env'),
    path.resolve(currentDir, '../../.env')
  ]
});
