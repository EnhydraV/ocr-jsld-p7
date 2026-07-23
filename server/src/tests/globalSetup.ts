import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

// Le chemin est relatif à schema.prisma, convention Prisma pour SQLite
const DATABASE_URL = 'file:./test.db';
const dbFile = path.resolve(process.cwd(), 'prisma/test.db');

export function setup(): void {
  rmSync(dbFile, { force: true });
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL },
    stdio: 'inherit',
  });
}

export function teardown(): void {
  rmSync(dbFile, { force: true });
  rmSync(`${dbFile}-journal`, { force: true });
}
