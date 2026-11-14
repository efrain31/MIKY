import pg from 'pg';

// Las columnas DATE (p. ej. fecha para recoger) se regresan tal cual, sin convertir a zona horaria
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

/** Ejecuta fn dentro de una transacción; hace ROLLBACK si truena. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Espera a que la BD acepte conexiones (al arrancar con docker compose). */
export async function waitForDb(tries = 30) {
  for (let i = 1; i <= tries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === tries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
