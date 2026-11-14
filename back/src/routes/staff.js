import fs from 'node:fs';
import { Router } from 'express';
import { query, tx } from '../db.js';
import { requireRole, STAFF, EDITORS } from '../auth.js';
import { badRequest, forbidden, notFound, int, str } from '../errors.js';
import { bus } from '../events.js';
import { changeStatus, loadOrder, allowedNext, STATUS_LABEL, TRANSITIONS } from '../orders.js';
import { imgUrl, pesos } from '../format.js';
import { imageUpload, looksLikeImage, publicPath } from '../uploads.js';
import { emit } from '../events.js';

const r = Router();
r.use(requireRole(...STAFF));

/** Sucursal que puede ver este usuario: la suya, o la que pida si no tiene asignada. */
function scopeBranch(req, requested) {
  if (req.user.branch_id) {
    if (requested && Number(requested) !== req.user.branch_id) throw forbidden('Sólo puedes ver tu sucursal.');
    return req.user.branch_id;
  }
  return requested ? Number(requested) : null;
}

/* ---------- Pedidos ---------- */
r.get('/meta', (req, res) => {
  res.json({
    statuses: STATUS_LABEL,
    transitions: Object.fromEntries(Object.keys(TRANSITIONS).map((s) => [s, allowedNext(s, req.user.role)])),
    canEditInventory: EDITORS.includes(req.user.role),
    canEditSite: EDITORS.includes(req.user.role),
    canManageUsers: req.user.role === 'admin',
    canSeeSales: ['ventas', 'supervisor', 'admin'].includes(req.user.role),
    canAnnulSales: EDITORS.includes(req.user.role),
  });
});

r.get('/orders', async (req, res) => {
  const branchId = scopeBranch(req, req.query.branch);
  const params = [];
  const where = [];
  if (branchId) { params.push(branchId); where.push(`o.branch_id = $${params.length}`); }
  if (req.query.status) { params.push(String(req.query.status).split(',')); where.push(`o.status::text = ANY($${params.length})`); }
  if (req.query.active === '1') where.push(`o.status NOT IN ('entregado','cancelado')`);
  const { rows } = await query(
    `SELECT o.id FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY o.created_at DESC LIMIT 200`, params);
  const orders = await Promise.all(rows.map((o) => loadOrder('o.id = $1', [o.id])));
  res.json(orders.map((o) => ({ ...o, next: allowedNext(o.status, req.user.role) })));
});

r.get('/orders/:id', async (req, res) => {
  const order = await loadOrder('o.id = $1', [int(req.params.id, { name: 'pedido', min: 1 })]);
  if (!order) throw notFound('Pedido no encontrado.');
  if (req.user.branch_id && order.branch.id !== req.user.branch_id) throw forbidden('Este pedido es de otra sucursal.');
  const events = await query(
    `SELECT e.status, e.note, e.created_at, u.name AS user_name, u.role AS user_role
       FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = $1 ORDER BY e.created_at`, [order.id]);
  res.json({ ...order, next: allowedNext(order.status, req.user.role), events: events.rows });
});

r.patch('/orders/:id/status', async (req, res) => {
  const next = str(req.body.status, { name: 'el estado', max: 30 });
  if (!STATUS_LABEL[next]) throw badRequest('Estado no válido.');
  const order = await changeStatus(int(req.params.id, { name: 'pedido', min: 1 }), next, req.user,
    str(req.body.note, { name: 'la nota', max: 300, optional: true }), { paymentMethod: req.body.paymentMethod });
  res.json({ ...order, next: allowedNext(order.status, req.user.role) });
});

/** Alertas en vivo (Server-Sent Events): pedidos nuevos y cambios de inventario. */
r.get('/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 4000\n\n');
  const branch = req.user.branch_id;
  const onEvent = (ev) => {
    const evBranch = ev.payload?.branch?.id ?? ev.payload?.branchId;
    if (branch && evBranch && evBranch !== branch) return;
    res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
  };
  bus.on('event', onEvent);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); bus.off('event', onEvent); });
});

/* ---------- Inventario ---------- */
r.get('/branches', async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, state FROM branches WHERE active ${req.user.branch_id ? 'AND id = $1' : ''} ORDER BY sort`,
    req.user.branch_id ? [req.user.branch_id] : []);
  res.json(rows);
});

r.get('/inventory', async (req, res) => {
  const branchId = scopeBranch(req, req.query.branch);
  if (!branchId) throw badRequest('Elige una sucursal.');
  const { rows } = await query(
    `SELECT p.id AS product_id, p.name, p.image, c.name AS category, v.id AS variant_id, v.label, v.price_cents,
            COALESCE(i.quantity, 0) AS quantity, i.updated_at, u.name AS updated_by
       FROM product_variants v
       JOIN products p ON p.id = v.product_id AND p.active
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory i ON i.variant_id = v.id AND i.branch_id = $1
       LEFT JOIN users u ON u.id = i.updated_by
      WHERE v.active ORDER BY c.sort, p.sort, v.sort`, [branchId]);
  res.json(rows.map((x) => ({
    productId: x.product_id, product: x.name, image: imgUrl(x.image), category: x.category,
    variantId: x.variant_id, size: x.label, price: pesos(x.price_cents),
    quantity: x.quantity, updatedAt: x.updated_at, updatedBy: x.updated_by,
  })));
});

/** Sube o baja existencias (sólo admin y supervisor). delta>0 entrada, delta<0 salida. */
r.post('/inventory/adjust', requireRole(...EDITORS), async (req, res) => {
  const branchId = scopeBranch(req, int(req.body.branchId, { name: 'la sucursal', min: 1 }));
  const variantId = int(req.body.variantId, { name: 'la presentación', min: 1 });
  const delta = int(req.body.delta, { name: 'la cantidad', min: -500, max: 500 });
  if (delta === 0) throw badRequest('La cantidad no puede ser cero.');
  const reason = str(req.body.reason, { name: 'el motivo', max: 120, optional: true }) || (delta > 0 ? 'Entrada de producción' : 'Salida / merma');

  const row = await tx(async (db) => {
    const ok = await db.query('SELECT 1 FROM branches b, product_variants v WHERE b.id = $1 AND v.id = $2', [branchId, variantId]);
    if (!ok.rowCount) throw notFound('Sucursal o presentación no encontrada.');
    const cur = await db.query('SELECT quantity FROM inventory WHERE branch_id = $1 AND variant_id = $2 FOR UPDATE', [branchId, variantId]);
    const now = cur.rows[0]?.quantity ?? 0;
    if (now + delta < 0) throw badRequest(`Sólo hay ${now} en existencia; no puedes bajar ${-delta}.`);
    const upd = await db.query(
      `INSERT INTO inventory (branch_id, variant_id, quantity, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (branch_id, variant_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING quantity`, [branchId, variantId, now + delta, req.user.id]);
    await db.query(
      `INSERT INTO inventory_movements (branch_id, variant_id, delta, quantity_after, reason, user_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [branchId, variantId, delta, upd.rows[0].quantity, reason, req.user.id]);
    return { branchId, variantId, quantity: upd.rows[0].quantity };
  });
  emit('inventory.updated', row);
  res.json(row);
});

r.get('/inventory/movements', async (req, res) => {
  const branchId = scopeBranch(req, req.query.branch);
  if (!branchId) throw badRequest('Elige una sucursal.');
  const { rows } = await query(
    `SELECT m.delta, m.quantity_after, m.reason, m.created_at, p.name AS product, v.label AS size, u.name AS user_name
       FROM inventory_movements m
       JOIN product_variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.branch_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT 100`, [branchId]);
  res.json(rows);
});

/** Renueva la foto de un producto (admin y supervisor). */
r.post('/products/:id/image', requireRole(...EDITORS), imageUpload, async (req, res) => {
  if (!req.file) throw badRequest('Sube una imagen.');
  if (!looksLikeImage(req.file.path)) { fs.unlinkSync(req.file.path); throw badRequest('El archivo no es una imagen válida.'); }
  const { rowCount } = await query('UPDATE products SET image = $2 WHERE id = $1', [int(req.params.id, { name: 'producto', min: 1 }), publicPath(req.file.filename)]);
  if (!rowCount) throw notFound('Producto no encontrado.');
  res.json({ image: publicPath(req.file.filename) });
});

export default r;
