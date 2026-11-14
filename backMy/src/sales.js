import { query, tx } from './db.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';
import { emit } from './events.js';
import { pesos } from './format.js';

export const IVA_RATE = 0.16;
export const PAYMENT = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
export const CHANNEL = { en_linea: 'En línea', mostrador: 'Mostrador' };

/** Los precios ya traen IVA: separa subtotal e IVA sin perder centavos. */
export function splitIva(totalCents, rate = IVA_RATE) {
  const subtotal = Math.round(totalCents / (1 + rate));
  return { subtotal, iva: totalCents - subtotal };
}

export function checkPayment(method) {
  if (!PAYMENT[method]) throw badRequest('Elige cómo pagó el cliente: efectivo, tarjeta o transferencia.');
  return method;
}

/** Inserta la venta y sus renglones (dentro de una transacción ya abierta). */
async function insertSale(db, { folio, branchId, channel, orderId = null, paymentMethod, customerName = null, userId, items }) {
  const total = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
  const { subtotal, iva } = splitIva(total);
  const { rows: [s] } = await db.query(
    `INSERT INTO sales (folio, branch_id, channel, order_id, payment_method, customer_name, iva_rate, subtotal_cents, iva_cents, total_cents, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [folio, branchId, channel, orderId, paymentMethod, customerName, IVA_RATE, subtotal, iva, total, userId]);
  for (const i of items) {
    await db.query(
      `INSERT INTO sale_items (sale_id, variant_id, product_name, variant_label, unit_price_cents, quantity) VALUES ($1, $2, $3, $4, $5, $6)`,
      [s.id, i.variant_id, i.product_name, i.variant_label, i.unit_price_cents, i.quantity]);
  }
  return s.id;
}

/** Pedido en línea entregado → venta (las existencias ya se apartaron al crear el pedido). */
export async function saleFromOrder(db, order, paymentMethod, userId) {
  const items = (await db.query('SELECT variant_id, product_name, variant_label, unit_price_cents, quantity FROM order_items WHERE order_id = $1', [order.id])).rows;
  const { rows: [u] } = await db.query('SELECT name FROM users WHERE id = $1', [order.user_id]);
  return insertSale(db, {
    folio: order.folio, branchId: order.branch_id, channel: 'en_linea', orderId: order.id,
    paymentMethod, customerName: u?.name, userId, items,
  });
}

/** Venta en mostrador: valida y descuenta existencias de la sucursal. */
export async function createCounterSale(actor, { branchId, items, paymentMethod, customerName }) {
  if (actor.branch_id && actor.branch_id !== branchId) throw forbidden('Sólo puedes registrar ventas de tu sucursal.');
  if (!Array.isArray(items) || !items.length) throw badRequest('Agrega al menos un producto.');
  const wanted = new Map();
  for (const it of items.slice(0, 60)) {
    const v = Number(it.variantId), q = Number(it.quantity);
    if (!Number.isInteger(v) || !Number.isInteger(q) || q < 1 || q > 200) throw badRequest('Revisa las cantidades.');
    wanted.set(v, (wanted.get(v) || 0) + q);
  }
  checkPayment(paymentMethod);

  const saleId = await tx(async (db) => {
    const br = await db.query('SELECT id FROM branches WHERE id = $1 AND active', [branchId]);
    if (!br.rowCount) throw badRequest('Sucursal no válida.');
    const ids = [...wanted.keys()].sort((a, b) => a - b);
    const vars = await db.query(
      `SELECT v.id, v.label, v.price_cents, p.name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ANY($1)`, [ids]);
    if (vars.rowCount !== ids.length) throw badRequest('Algún producto ya no existe.');
    const stock = await db.query(
      `SELECT variant_id, quantity FROM inventory WHERE branch_id = $1 AND variant_id = ANY($2) ORDER BY variant_id FOR UPDATE`, [branchId, ids]);
    const have = Object.fromEntries(stock.rows.map((r) => [r.variant_id, r.quantity]));
    const missing = vars.rows.filter((v) => (have[v.id] ?? 0) < wanted.get(v.id))
      .map((v) => ({ variantId: v.id, product: v.name, size: v.label, wanted: wanted.get(v.id), available: have[v.id] ?? 0 }));
    if (missing.length) throw conflict('No hay suficientes existencias para algunos productos.', { missing });

    const { rows: [{ folio }] } = await db.query(
      `SELECT 'MV-' || to_char(now() AT TIME ZONE 'America/Mexico_City', 'YYMMDD') || '-' || nextval('sale_folio_seq') AS folio`);
    const lines = vars.rows.map((v) => ({ variant_id: v.id, product_name: v.name, variant_label: v.label, unit_price_cents: v.price_cents, quantity: wanted.get(v.id) }));
    const id = await insertSale(db, {
      folio, branchId, channel: 'mostrador', paymentMethod, userId: actor.id, items: lines,
      customerName: customerName ? String(customerName).trim().slice(0, 80) || null : null,
    });
    for (const l of lines) {
      const upd = await db.query(
        `UPDATE inventory SET quantity = quantity - $3, updated_at = now(), updated_by = $4 WHERE branch_id = $1 AND variant_id = $2 RETURNING quantity`,
        [branchId, l.variant_id, l.quantity, actor.id]);
      await db.query(
        `INSERT INTO inventory_movements (branch_id, variant_id, delta, quantity_after, reason, user_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [branchId, l.variant_id, -l.quantity, upd.rows[0].quantity, `Venta mostrador ${folio}`, actor.id]);
      emit('inventory.updated', { branchId, variantId: l.variant_id, quantity: upd.rows[0].quantity });
    }
    return id;
  });
  const sale = await loadSale(saleId);
  emit('sale.created', sale);
  return sale;
}

/** Anula una venta (sólo supervisor/admin). Con restock=true las piezas regresan al inventario. */
export async function annulSale(actor, saleId, { reason, restock }) {
  await tx(async (db) => {
    const { rows: [s] } = await db.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId]);
    if (!s) throw notFound('Venta no encontrada.');
    if (actor.branch_id && actor.branch_id !== s.branch_id) throw forbidden('Esta venta es de otra sucursal.');
    if (s.cancelled_at) throw conflict('Esta venta ya estaba anulada.');
    await db.query('UPDATE sales SET cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 WHERE id = $1', [s.id, actor.id, reason]);
    if (restock) {
      const items = await db.query('SELECT variant_id, quantity FROM sale_items WHERE sale_id = $1 ORDER BY variant_id', [s.id]);
      for (const it of items.rows) {
        const upd = await db.query(
          `INSERT INTO inventory (branch_id, variant_id, quantity, updated_by) VALUES ($1, $2, $3, $4)
           ON CONFLICT (branch_id, variant_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = now(), updated_by = EXCLUDED.updated_by
           RETURNING quantity`, [s.branch_id, it.variant_id, it.quantity, actor.id]);
        await db.query(
          `INSERT INTO inventory_movements (branch_id, variant_id, delta, quantity_after, reason, user_id) VALUES ($1, $2, $3, $4, $5, $6)`,
          [s.branch_id, it.variant_id, it.quantity, upd.rows[0].quantity, `Anulación ${s.folio}`, actor.id]);
      }
    }
  });
  return loadSale(saleId);
}

const SALE_SELECT = `
  SELECT s.*, b.name AS branch_name, u.name AS user_name, cu.name AS cancelled_by_name
    FROM sales s
    JOIN branches b ON b.id = s.branch_id
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN users cu ON cu.id = s.cancelled_by`;

export function saleDto(s, items) {
  return {
    id: s.id, folio: s.folio, channel: s.channel, paymentMethod: s.payment_method,
    branch: { id: s.branch_id, name: s.branch_name },
    customerName: s.customer_name, user: s.user_name,
    ivaRate: Number(s.iva_rate), subtotal: pesos(s.subtotal_cents), iva: pesos(s.iva_cents), total: pesos(s.total_cents),
    createdAt: s.created_at,
    cancelled: s.cancelled_at ? { at: s.cancelled_at, by: s.cancelled_by_name, reason: s.cancel_reason } : null,
    ...(items ? { items: items.map((i) => ({ product: i.product_name, size: i.variant_label, price: pesos(i.unit_price_cents), quantity: i.quantity })) } : {}),
  };
}

export async function loadSale(id) {
  const { rows: [s] } = await query(`${SALE_SELECT} WHERE s.id = $1`, [id]);
  if (!s) return null;
  const items = await query('SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id', [id]);
  return saleDto(s, items.rows);
}

/** Filtro común: sucursal (respetando la del usuario) y rango de fechas en hora de México. */
export function salesFilter(user, { branch, from, to }) {
  const params = [], where = [];
  const b = user.branch_id || (branch ? Number(branch) : null);
  if (b) { params.push(b); where.push(`s.branch_id = $${params.length}`); }
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (from) { if (!day.test(from)) throw badRequest('Fecha inicial no válida.'); params.push(from); where.push(`s.created_at >= ($${params.length}::date)::timestamp AT TIME ZONE 'America/Mexico_City'`); }
  if (to) { if (!day.test(to)) throw badRequest('Fecha final no válida.'); params.push(to); where.push(`s.created_at < ($${params.length}::date + 1)::timestamp AT TIME ZONE 'America/Mexico_City'`); }
  return { params, where };
}

export { SALE_SELECT };
