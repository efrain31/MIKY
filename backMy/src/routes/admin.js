import fs from 'node:fs';
import { Router } from 'express';
import { query } from '../db.js';
import { requireRole, hashPassword, checkPasswordStrength, EDITORS } from '../auth.js';
import { badRequest, conflict, forbidden, notFound, str, int, EMAIL_RE } from '../errors.js';
import { imageUpload, looksLikeImage, publicPath } from '../uploads.js';

const ROLES = ['cliente', 'ventas', 'produccion', 'supervisor', 'admin'];
const KEY_RE = /^[a-z0-9][a-z0-9._-]{1,59}$/;

/* ---------- Contenido del sitio (admin y supervisor) ---------- */
export const content = Router();
content.use(requireRole(...EDITORS));

content.put('/:key', async (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) throw badRequest('Clave de contenido no válida.');
  const value = str(req.body.value, { name: 'el texto', min: 1, max: 2000 });
  await query(
    `INSERT INTO site_content (key, kind, value, updated_by) VALUES ($1, 'text', $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, kind = 'text', updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, value, req.user.id]);
  res.json({ key, kind: 'text', value });
});

content.post('/:key/image', imageUpload, async (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) throw badRequest('Clave de contenido no válida.');
  if (!req.file) throw badRequest('Sube una imagen.');
  if (!looksLikeImage(req.file.path)) { fs.unlinkSync(req.file.path); throw badRequest('El archivo no es una imagen válida.'); }
  const value = publicPath(req.file.filename);
  await query(
    `INSERT INTO site_content (key, kind, value, updated_by) VALUES ($1, 'image', $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, kind = 'image', updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, value, req.user.id]);
  res.json({ key, kind: 'image', value });
});

/** Regresa un texto o imagen al valor original del sitio. */
content.delete('/:key', async (req, res) => {
  await query('DELETE FROM site_content WHERE key = $1', [String(req.params.key)]);
  res.json({ ok: true });
});

/* ---------- Usuarios y roles (sólo admin) ---------- */
export const users = Router();
users.use(requireRole('admin'));

const userDto = (u) => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, active: u.active,
  branch: u.branch_id ? { id: u.branch_id, name: u.branch_name } : null,
  createdAt: u.created_at, lastLoginAt: u.last_login_at,
});

users.get('/', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.q) { params.push(`%${String(req.query.q).slice(0, 80)}%`); where = `WHERE u.email ILIKE $1 OR u.name ILIKE $1`; }
  if (req.query.staff === '1') where += `${where ? ' AND' : 'WHERE'} u.role <> 'cliente'`;
  const { rows } = await query(
    `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id ${where}
      ORDER BY (u.role = 'cliente'), u.created_at DESC LIMIT 300`, params);
  res.json(rows.map(userDto));
});

async function validBranch(v) {
  if (v === null || v === undefined || v === '') return null;
  const id = int(v, { name: 'la sucursal', min: 1 });
  const ok = await query('SELECT 1 FROM branches WHERE id = $1', [id]);
  if (!ok.rowCount) throw badRequest('Sucursal no válida.');
  return id;
}

users.post('/', async (req, res) => {
  const email = str(req.body.email, { name: 'el correo', max: 160 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest('Escribe un correo válido.');
  const name = str(req.body.name, { name: 'el nombre', min: 2, max: 80 });
  const role = String(req.body.role || 'ventas');
  if (!ROLES.includes(role)) throw badRequest('Rol no válido.');
  const weak = checkPasswordStrength(req.body.password);
  if (weak) throw badRequest(weak);
  if ((await query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount) throw conflict('Ya existe un usuario con ese correo.');
  const { rows: [{ id }] } = await query(
    `INSERT INTO users (email, name, phone, role, branch_id, password_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [email, name, str(req.body.phone, { name: 'el teléfono', max: 25, optional: true }), role, await validBranch(req.body.branchId), await hashPassword(req.body.password)]);
  const { rows: [u] } = await query('SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1', [id]);
  res.status(201).json(userDto(u));
});

users.patch('/:id', async (req, res) => {
  const id = int(req.params.id, { name: 'usuario', min: 1 });
  const { rows: [u] } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!u) throw notFound('Usuario no encontrado.');
  const isSelf = id === req.user.id;
  const role = req.body.role ?? u.role;
  if (!ROLES.includes(role)) throw badRequest('Rol no válido.');
  const active = req.body.active ?? u.active;
  if (isSelf && (role !== 'admin' || !active)) throw forbidden('No puedes quitarte el rol de admin ni desactivarte a ti mismo.');
  const branchId = 'branchId' in req.body ? await validBranch(req.body.branchId) : u.branch_id;
  const name = req.body.name ? str(req.body.name, { name: 'el nombre', min: 2, max: 80 }) : u.name;
  await query('UPDATE users SET role = $2, active = $3, branch_id = $4, name = $5 WHERE id = $1', [id, role, Boolean(active), branchId, name]);
  if (!active) await query('DELETE FROM sessions WHERE user_id = $1', [id]);   // lo saca de inmediato
  const { rows: [out] } = await query('SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1', [id]);
  res.json(userDto(out));
});

users.post('/:id/password', async (req, res) => {
  const id = int(req.params.id, { name: 'usuario', min: 1 });
  const weak = checkPasswordStrength(req.body.password);
  if (weak) throw badRequest(weak);
  const { rowCount } = await query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, await hashPassword(req.body.password)]);
  if (!rowCount) throw notFound('Usuario no encontrado.');
  await query('DELETE FROM sessions WHERE user_id = $1', [id]);
  res.json({ ok: true });
});
