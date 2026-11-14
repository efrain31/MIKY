import fs from 'node:fs';
import path from 'node:path';
import { query, tx } from './db.js';

/** Aplica en orden los .sql de MIGRATIONS_DIR que aún no se han corrido (sin borrar datos). */
export async function migrate(dir = process.env.MIGRATIONS_DIR || '/app/migrations') {
  if (!fs.existsSync(dir)) return;
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await tx(async (db) => {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    });
    console.log(`✔ Migración aplicada: ${f}`);
  }
}
