import fs from 'fs';
import path from 'path';
import { pool, query } from './db';
import { config } from './config';

// En build, el .js queda en dist/ pero las SQL se copian a /app/migrations
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ||
  (fs.existsSync(path.join(__dirname, 'migrations'))
    ? path.join(__dirname, 'migrations')
    : path.join(__dirname, '..', 'migrations'));

async function ensureTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

async function appliedVersions(): Promise<Set<string>> {
  const res = await query<{ version: string }>(
    'SELECT version FROM schema_migrations'
  );
  return new Set(res.rows.map((r) => r.version));
}

export async function runMigrations(): Promise<void> {
  await ensureTable();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied = await appliedVersions();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) {
      console.log(`[migrate] omitida (ya aplicada): ${version}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`[migrate] aplicando: ${version}`);
    await query('BEGIN');
    try {
      await query(sql);
      await query('INSERT INTO schema_migrations (version) VALUES ($1)', [
        version
      ]);
      await query('COMMIT');
      console.log(`[migrate] aplicada: ${version}`);
    } catch (err) {
      await query('ROLLBACK');
      console.error(`[migrate] ERROR en ${version}:`, (err as Error).message);
      throw err;
    }
  }
  console.log('[migrate] completado.');
}

// Permite ejecutar con: ts-node src/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
