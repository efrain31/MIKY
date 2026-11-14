import { query, tx } from './db.js';
import { conflict, badRequest, notFound, forbidden } from './errors.js';
import { emit } from './events.js';
import { orderDto } from './format.js';
import { saleFromOrder, checkPayment } from './sales.js';

export const STATUS_LABEL = {
  nuevo: 'Nuevo',
  confirmado: 'Confirmado',
  en_produccion: 'En producción',
  listo: 'Listo para recoger',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Qué rol puede mover un pedido de un estado a otro. */
export const TRANSITIONS = {
  nuevo: { confirmado: ['ventas', 'supervisor', 'admin'], cancelado: ['ventas', 'supervisor', 'admin'] },
  confirmado: {
    en_produccion: ['produccion', 'supervisor', 'admin'],
    listo: ['produccion', 'supervisor', 'admin'],
    cancelado: ['ventas', 'supervisor', 'admin'],
  },
  en_produccion: { listo: ['produccion', 'supervisor', 'admin'], cancelado: ['supervisor', 'admin'] },
  listo: { entregado: ['ventas', 'supervisor', 'admin'], cancelado: ['supervisor', 'admin'] },
  entregado: {},
  cancelado: {},
};

export const allowedNext = (status, role) =>
  Object.entries(TRANSITIONS[status] || {}).filter(([, roles]) => roles.includes(role)).map(([s]) => s);

const ORDER_SELECT = `
  SELECT o.*, b.name AS branch_name, b.address AS branch_address, b.phones AS branch_phones,
         u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
    FROM orders o
    JOIN branches b ON b.id = o.branch_id
    JOIN users u ON u.id = o.user_id`;

export async function loadOrder(where, params, db = { query }) {
  const { rows } = await db.query(`${ORDER_SELECT} WHERE ${where}`, params);
  if (!rows[0]) return null;
  const items = await db.query(
    `SELECT oi.*, COALESCE(v.image, p.image) AS image
       FROM order_items oi
       JOIN product_variants v ON v.id = oi.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE oi.order_id = $1 ORDER BY oi.id`, [rows[0].id]);
  return orderDto(rows[0], items.rows);
}

/**
 * Crea el pedido a partir del carrito del usuario: valida existencias en la sucursal,
 * las descuenta (reserva), guarda el ticket y vacía el carrito. Todo o nada.
 */
export async function createOrderFromCart(userId, { branchId, pickupDate, notes }) {
  const order = await tx(async (db) => {
    const branch = await db.query('SELECT id, name FROM branches WHERE id = $1 AND active', [branchId]);
    if (!branch.rows[0]) throw badRequest('Elige una sucursal válida.');

    const cart = await db.query(
      `SELECT c.variant_id, c.quantity, v.label, v.price_cents, p.name
         FROM cart_items c
         JOIN product_variants v ON v.id = c.variant_id AND v.active
         JOIN products p ON p.id = v.product_id AND p.active
        WHERE c.user_id = $1 ORDER BY c.added_at FOR UPDATE OF c`, [userId]);
    if (!cart.rows.length) throw badRequest('Tu carrito está vacío.');

    // Bloquea las filas de inventario en orden fijo para evitar interbloqueos
    const ids = cart.rows.map((r) => r.variant_id).sort((a, b) => a - b);
    const stock = await db.query(
      `SELECT variant_id, quantity FROM inventory
        WHERE branch_id = $1 AND variant_id = ANY($2) ORDER BY variant_id FOR UPDATE`, [branchId, ids]);
    const have = Object.fromEntries(stock.rows.map((r) => [r.variant_id, r.quantity]));
    const missing = cart.rows
      .filter((r) => (have[r.variant_id] ?? 0) < r.quantity)
      .map((r) => ({ variantId: r.variant_id, product: r.name, size: r.label, wanted: r.quantity, available: have[r.variant_id] ?? 0 }));
    if (missing.length) {
      throw conflict(`No hay suficientes existencias en ${branch.rows[0].name} para algunos productos.`, { missing });
    }

    const total = cart.rows.reduce((s, r) => s + r.price_cents * r.quantity, 0);
    const { rows: [o] } = await db.query(
      `INSERT INTO orders (folio, user_id, branch_id, pickup_date, notes, total_cents)
       VALUES ('MK-' || to_char(now() AT TIME ZONE 'America/Mexico_City', 'YYMMDD') || '-' || nextval('order_folio_seq'),
               $1, $2, $3, $4, $5)
       RETURNING id, folio`, [userId, branchId, pickupDate, notes, total]);

    for (const r of cart.rows) {
      await db.query(
        `INSERT INTO order_items (order_id, variant_id, product_name, variant_label, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)`, [o.id, r.variant_id, r.name, r.label, r.price_cents, r.quantity]);
      const upd = await db.query(
        `UPDATE inventory SET quantity = quantity - $3, updated_at = now()
          WHERE branch_id = $1 AND variant_id = $2 RETURNING quantity`, [branchId, r.variant_id, r.quantity]);
      await db.query(
        `INSERT INTO inventory_movements (branch_id, variant_id, delta, quantity_after, reason, order_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [branchId, r.variant_id, -r.quantity, upd.rows[0].quantity, `Pedido ${o.folio}`, o.id, userId]);
    }
    await db.query(`INSERT INTO order_events (order_id, status, user_id, note) VALUES ($1, 'nuevo', $2, 'Pedido creado en línea')`, [o.id, userId]);
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    return loadOrder('o.id = $1', [o.id], db);
  });

  emit('order.created', order);
  return order;
}

/** Cambia el estado; si se cancela, regresa las existencias a la sucursal.
 *  Al marcarlo «entregado» se registra la venta (se pagó al recoger) con su método de pago. */
export async function changeStatus(orderId, nextStatus, actor, note, { paymentMethod } = {}) {
  const order = await tx(async (db) => {
    const { rows: [o] } = await db.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o) throw notFound('Pedido no encontrado.');

    const isOwnerCancel = actor.role === 'cliente';
    if (isOwnerCancel) {
      if (o.user_id !== actor.id) throw notFound('Pedido no encontrado.');
      if (!(o.status === 'nuevo' && nextStatus === 'cancelado')) throw forbidden('Sólo puedes cancelar mientras el pedido no se haya confirmado.');
    } else {
      if (actor.branch_id && actor.branch_id !== o.branch_id) throw forbidden('Este pedido es de otra sucursal.');
      if (!allowedNext(o.status, actor.role).includes(nextStatus)) {
        throw forbidden(`Tu rol no puede pasar un pedido de «${STATUS_LABEL[o.status]}» a «${STATUS_LABEL[nextStatus] || nextStatus}».`);
      }
    }

    if (nextStatus === 'cancelado') {
      const items = await db.query('SELECT variant_id, quantity FROM order_items WHERE order_id = $1 ORDER BY variant_id', [o.id]);
      for (const it of items.rows) {
        const upd = await db.query(
          `INSERT INTO inventory (branch_id, variant_id, quantity) VALUES ($1, $2, $3)
           ON CONFLICT (branch_id, variant_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = now()
           RETURNING quantity`, [o.branch_id, it.variant_id, it.quantity]);
        await db.query(
          `INSERT INTO inventory_movements (branch_id, variant_id, delta, quantity_after, reason, order_id, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [o.branch_id, it.variant_id, it.quantity, upd.rows[0].quantity, `Cancelación ${o.folio}`, o.id, actor.id]);
      }
    }

    if (nextStatus === 'entregado') await saleFromOrder(db, o, checkPayment(paymentMethod), actor.id);

    await db.query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [o.id, nextStatus]);
    await db.query('INSERT INTO order_events (order_id, status, user_id, note) VALUES ($1, $2, $3, $4)', [o.id, nextStatus, actor.id, note || null]);
    return loadOrder('o.id = $1', [o.id], db);
  });

  emit('order.updated', order);
  return order;
}
