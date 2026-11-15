#!/usr/bin/env bash
# Desde la Mac: crea (o reinicia) un usuario de prueba por cada rol en el servidor.
#   bash despliegue/usuarios-prueba.sh            (por defecto city@45.232.252.81)
# Correos prueba.<rol>@pasteleriasmiky.com, todos con la misma contraseña nueva, que se genera
# dentro del contenedor y se imprime una sola vez (no queda en la línea de comandos ni en git).
# Se puede volver a correr: actualiza la contraseña y los reactiva.
set -euo pipefail
SERVER="${1:-city@45.232.252.81}"

ssh "$SERVER" 'docker exec -i miky-backMy node --input-type=module' <<'JS'
import crypto from 'node:crypto';
import { query, pool } from '/app/src/db.js';
import { hashPassword } from '/app/src/auth.js';

const password = `Prueba${crypto.randomBytes(6).toString('hex')}`;
const hash = await hashPassword(password);
const roles = { cliente: 'Cliente', ventas: 'Ventas', produccion: 'Producción', supervisor: 'Supervisor', admin: 'Admin' };

for (const [role, label] of Object.entries(roles)) {
  const email = `prueba.${role}@pasteleriasmiky.com`;
  await query(
    `INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, active = true`,
    [email, `Prueba ${label}`, role, hash]);
  console.log(`✔ ${role.padEnd(10)} ${email}`);
}
console.log(`\nContraseña de todos: ${password}`);
await pool.end();
JS
