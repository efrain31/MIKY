import { Router } from 'express';
import { query } from '../db.js';
import {
  hashPassword, verifyPassword, checkPasswordStrength, createSession, destroySession,
  requireUser, loginRateLimit, STAFF, EDITORS,
} from '../auth.js';
import { badRequest, unauthorized, conflict, notFound, str, int, EMAIL_RE } from '../errors.js';
import { createOrderFromCart, changeStatus, loadOrder } from '../orders.js';
import { imgUrl, pesos } from '../format.js';

const r = Router();

const meDto = (u) => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role,
  branch: u.branch_id ? { id: u.branch_id, name: u.branch_name } : null,
  isStaff: STAFF.includes(u.role),
  canEditSite: EDITORS.includes(u.role),
});

/* ---------- Registro / inicio / cierre de sesión ---------- */
r.post('/auth/register', async (req, res) => {
  const name = str(req.body.name, { name: 'tu nombre', min: 2, max: 80 });
  const email = str(req.body.email, { name: 'tu correo', max: 160 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest('Escribe un correo válido.');
  const phone = str(req.body.phone, { name: 'tu teléfono', min: 7, max: 25, optional: true });
  const weak = checkPasswordStrength(req.body.password);
  if (weak) throw badRequest(weak);

  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) throw conflict('Ya existe una cuenta con ese correo. Inicia sesión.');

  // El registro público siempre crea clientes; el personal lo da de alta un admin.
  const { rows: [u] } = await query(
    `INSERT INTO users (email, name, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, name, phone, await hashPassword(req.body.password)]);
  await createSession(res, u.id, req.get('user-agent'));
  const { rows: [me] } = await query('SELECT u.*, NULL AS branch_name FROM users u WHERE id = $1', [u.id]);
  res.status(201).json(meDto(me));
});

r.post('/auth/login', loginRateLimit, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const { rows: [u] } = await query(
    `SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.email = $1`, [email]);
  // Mismo mensaje si no existe o si la contraseña es incorrecta (no revela qué correos existen)
  const ok = u && u.active && await verifyPassword(password, u.password_hash);
  if (!ok) {
    req.loginAttempt.fail();
    throw unauthorized('Correo o contraseña incorrectos.');
  }
  req.loginAttempt.ok();
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  await createSession(res, u.id, req.get('user-agent'));
  res.json(meDto(u));
});

r.post('/auth/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

r.get('/auth/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(req.user ? meDto(req.user) : null);
});

/* ---------- Perfil ---------- */
r.patch('/me', requireUser, async (req, res) => {
  const name = str(req.body.name, { name: 'tu nombre', min: 2, max: 80 });
  const phone = str(req.body.phone, { name: 'tu teléfono', min: 7, max: 25, optional: true });
  await query('UPDATE users SET name = $2, phone = $3 WHERE id = $1', [req.user.id, name, phone]);
  res.json(meDto({ ...req.user, name, phone }));
});

r.post('/me/password', requireUser, async (req, res) => {
  const { rows: [u] } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!await verifyPassword(String(req.body.current || ''), u.password_hash)) throw badRequest('Tu contraseña actual no coincide.');
  const weak = checkPasswordStrength(req.body.next);
  if (weak) throw badRequest(weak);
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await hashPassword(req.body.next)]);
  // Cierra las demás sesiones abiertas con la contraseña anterior
  await query('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);
  await createSession(res, req.user.id, req.get('user-agent'));
  res.json({ ok: true });
});

/* ---------- Favoritos ---------- */
r.get('/me/favorites', requireUser, async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.slug, p.name, p.image, p.color, c.slug AS category,
            (SELECT min(price_cents) FROM product_variants v WHERE v.product_id = p.id AND v.active) AS from_cents
       FROM favorites f JOIN products p ON p.id = f.product_id JOIN categories c ON c.id = p.category_id
      WHERE f.user_id = $1 AND p.active ORDER BY f.created_at DESC`, [req.user.id]);
  res.json(rows.map((p) => ({ id: p.id, slug: p.slug, name: p.name, image: imgUrl(p.image), color: p.color, category: p.category, from: pesos(p.from_cents) })));
});

r.put('/me/favorites/:productId', requireUser, async (req, res) => {
  const pid = int(req.params.productId, { name: 'producto', min: 1 });
  const ok = await query('SELECT 1 FROM products WHERE id = $1 AND active', [pid]);
  if (!ok.rowCount) throw notFound('Producto no encontrado.');
  await query('INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, pid]);
  res.json({ ok: true });
});

r.delete('/me/favorites/:productId', requireUser, async (req, res) => {
  await query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [req.user.id, Number(req.params.productId) || 0]);
  res.json({ ok: true });
});

/* ---------- Carrito (guardado en la cuenta) ---------- */
async function cartDto(userId) {
  const { rows } = await query(
    `SELECT c.variant_id, c.quantity, v.label, v.serves, v.price_cents, COALESCE(v.image, p.image) AS image,
            p.id AS product_id, p.name, p.color
       FROM cart_items c JOIN product_variants v ON v.id = c.variant_id JOIN products p ON p.id = v.product_id
      WHERE c.user_id = $1 AND v.active AND p.active ORDER BY c.added_at`, [userId]);
  const items = rows.map((x) => ({
    variantId: x.variant_id, productId: x.product_id, name: x.name, size: x.label, serves: x.serves,
    price: pesos(x.price_cents), quantity: x.quantity, image: imgUrl(x.image), color: x.color,
  }));
  return { items, total: items.reduce((s, i) => s + i.price * i.quantity, 0) };
}

r.get('/me/cart', requireUser, async (req, res) => res.json(await cartDto(req.user.id)));

/** Fija la cantidad de una presentación (0 = quitar). */
r.put('/me/cart/:variantId', requireUser, async (req, res) => {
  const vid = int(req.params.variantId, { name: 'presentación', min: 1 });
  const qty = int(req.body.quantity, { name: 'cantidad', min: 0, max: 50 });
  if (qty === 0) {
    await query('DELETE FROM cart_items WHERE user_id = $1 AND variant_id = $2', [req.user.id, vid]);
  } else {
    const ok = await query('SELECT 1 FROM product_variants WHERE id = $1 AND active', [vid]);
    if (!ok.rowCount) throw notFound('Presentación no encontrada.');
    await query(
      `INSERT INTO cart_items (user_id, variant_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity`, [req.user.id, vid, qty]);
  }
  res.json(await cartDto(req.user.id));
});

/** Une el carrito que el visitante armó sin sesión con el de su cuenta. */
r.post('/me/cart/merge', requireUser, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 60) : [];
  for (const it of items) {
    const vid = Number(it.variantId), qty = Number(it.quantity);
    if (!Number.isInteger(vid) || !Number.isInteger(qty) || qty < 1) continue;
    await query(
      `INSERT INTO cart_items (user_id, variant_id, quantity)
       SELECT $1, id, LEAST($3, 50) FROM product_variants WHERE id = $2 AND active
       ON CONFLICT (user_id, variant_id) DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 50)`,
      [req.user.id, vid, qty]);
  }
  res.json(await cartDto(req.user.id));
});

/* ---------- Pedidos del cliente ---------- */
r.post('/orders', requireUser, async (req, res) => {
  const branchId = int(req.body.branchId, { name: 'la sucursal', min: 1 });
  let pickupDate = null;
  if (req.body.pickupDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.pickupDate)) throw badRequest('La fecha para recoger no es válida.');
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })).toISOString().slice(0, 10);
    if (req.body.pickupDate < today) throw badRequest('La fecha para recoger no puede ser en el pasado.');
    pickupDate = req.body.pickupDate;
  }
  const notes = str(req.body.notes, { name: 'la nota', max: 400, optional: true });
  const order = await createOrderFromCart(req.user.id, { branchId, pickupDate, notes });
  res.status(201).json(order);
});

r.get('/me/orders', requireUser, async (req, res) => {
  const { rows } = await query('SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  res.json(await Promise.all(rows.map((o) => loadOrder('o.id = $1', [o.id]))));
});

r.get('/orders/:folio', requireUser, async (req, res) => {
  const order = await loadOrder('o.folio = $1', [String(req.params.folio)]);
  const own = order && (await query('SELECT 1 FROM orders WHERE folio = $1 AND user_id = $2', [order.folio, req.user.id])).rowCount;
  if (!order || (!own && !STAFF.includes(req.user.role))) throw notFound('Pedido no encontrado.');
  res.json(order);
});

r.post('/orders/:folio/cancel', requireUser, async (req, res) => {
  const { rows: [o] } = await query('SELECT id FROM orders WHERE folio = $1 AND user_id = $2', [String(req.params.folio), req.user.id]);
  if (!o) throw notFound('Pedido no encontrado.');
  res.json(await changeStatus(o.id, 'cancelado', { ...req.user, role: 'cliente' }, 'Cancelado por el cliente'));
});

export default r;
