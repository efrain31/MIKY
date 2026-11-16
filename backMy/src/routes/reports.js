import { Router } from 'express';
import { query } from '../db.js';
import { requireRole, STAFF } from '../auth.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { STATUS_LABEL } from '../orders.js';
import { PAYMENT, CHANNEL } from '../sales.js';

/* Reportes del panel: cada uno regresa columnas + renglones y el navegador arma el CSV, Excel o PDF.
   Respetan la sucursal del usuario y, cuando aplica, el rango de fechas (hora de México). */
const r = Router();
r.use(requireRole(...STAFF));

const TZ = 'America/Mexico_City';
const MAX_ROWS = 20000;
const SALES_ROLES = ['ventas', 'supervisor', 'admin'];
const ROLE = { cliente: 'Cliente', ventas: 'Ventas', produccion: 'Producción', supervisor: 'Supervisor', admin: 'Administrador' };
const money = (c) => (c == null ? null : Number(c) / 100);

// Columnas: type text | int | money | date | datetime; sum = se totaliza al pie
const col = (label, type = 'text', sum = false) => ({ label, type, ...(sum ? { sum } : {}) });

/** Arma el WHERE común: sucursal (la del usuario manda) y fechas sobre la columna indicada. */
function filters(req, { branchCol, dateCol }) {
  const params = [], where = [];
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const { branch, from, to } = req.query;
  if (req.user.branch_id && branch && Number(branch) !== req.user.branch_id) throw forbidden('Sólo puedes ver tu sucursal.');
  const b = req.user.branch_id || (branch ? Number(branch) : null);
  if (branchCol && b) { params.push(b); where.push(`${branchCol} = $${params.length}`); }
  if (dateCol && from) {
    if (!day.test(from)) throw badRequest('Fecha inicial no válida.');
    params.push(from); where.push(`${dateCol} >= ($${params.length}::date)::timestamp AT TIME ZONE '${TZ}'`);
  }
  if (dateCol && to) {
    if (!day.test(to)) throw badRequest('Fecha final no válida.');
    params.push(to); where.push(`${dateCol} < ($${params.length}::date + 1)::timestamp AT TIME ZONE '${TZ}'`);
  }
  return { params, where: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}

const REPORTS = {
  ventas: {
    title: 'Registro de ventas', group: 'Ventas', dated: true, roles: SALES_ROLES,
    description: 'Cada venta con folio, canal, método de pago y desglose de IVA.',
    columns: [col('Folio'), col('Fecha', 'datetime'), col('Sucursal'), col('Canal'), col('Método de pago'), col('Cliente'), col('Atendió'),
      col('Subtotal', 'money', true), col('IVA 16 %', 'money', true), col('Total', 'money', true), col('Estado'), col('Motivo de anulación')],
    async rows(req) {
      const f = filters(req, { branchCol: 's.branch_id', dateCol: 's.created_at' });
      const { rows } = await query(
        `SELECT s.folio, s.created_at, b.name AS branch, s.channel, s.payment_method, s.customer_name, u.name AS user_name,
                s.subtotal_cents, s.iva_cents, s.total_cents, s.cancelled_at, s.cancel_reason
           FROM sales s JOIN branches b ON b.id = s.branch_id LEFT JOIN users u ON u.id = s.user_id
           ${f.where} ORDER BY s.created_at LIMIT ${MAX_ROWS}`, f.params);
      return rows.map((s) => [s.folio, s.created_at, s.branch, CHANNEL[s.channel], PAYMENT[s.payment_method], s.customer_name, s.user_name,
        money(s.subtotal_cents), money(s.iva_cents), money(s.total_cents), s.cancelled_at ? 'Anulada' : 'Vigente', s.cancel_reason]);
    },
    // las anuladas se listan pero no entran al total
    skipInTotals: (row) => row[10] === 'Anulada',
  },
  'ventas-detalle': {
    title: 'Ventas por producto (detalle)', group: 'Ventas', dated: true, roles: SALES_ROLES,
    description: 'Cada renglón vendido: producto, presentación, cantidad e importe.',
    columns: [col('Folio'), col('Fecha', 'datetime'), col('Sucursal'), col('Canal'), col('Producto'), col('Presentación'),
      col('Cantidad', 'int', true), col('Precio unitario', 'money'), col('Importe', 'money', true)],
    async rows(req) {
      const f = filters(req, { branchCol: 's.branch_id', dateCol: 's.created_at' });
      const { rows } = await query(
        `SELECT s.folio, s.created_at, b.name AS branch, s.channel, i.product_name, i.variant_label, i.quantity, i.unit_price_cents
           FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN branches b ON b.id = s.branch_id
           ${f.where ? f.where + ' AND' : 'WHERE'} s.cancelled_at IS NULL
          ORDER BY s.created_at, i.id LIMIT ${MAX_ROWS}`, f.params);
      return rows.map((x) => [x.folio, x.created_at, x.branch, CHANNEL[x.channel], x.product_name, x.variant_label,
        x.quantity, money(x.unit_price_cents), money(x.unit_price_cents * x.quantity)]);
    },
  },
  'ventas-producto': {
    title: 'Productos más vendidos', group: 'Ventas', dated: true, roles: SALES_ROLES,
    description: 'Piezas e importe por producto y presentación, de más a menos vendido.',
    columns: [col('Producto'), col('Presentación'), col('Piezas', 'int', true), col('Ventas', 'int'), col('Importe', 'money', true)],
    async rows(req) {
      const f = filters(req, { branchCol: 's.branch_id', dateCol: 's.created_at' });
      const { rows } = await query(
        `SELECT i.product_name, i.variant_label, sum(i.quantity)::int AS qty, count(DISTINCT s.id)::int AS n,
                sum(i.quantity * i.unit_price_cents)::bigint AS total
           FROM sale_items i JOIN sales s ON s.id = i.sale_id
           ${f.where ? f.where + ' AND' : 'WHERE'} s.cancelled_at IS NULL
          GROUP BY 1, 2 ORDER BY qty DESC, total DESC`, f.params);
      return rows.map((x) => [x.product_name, x.variant_label, x.qty, x.n, money(x.total)]);
    },
  },
  'ventas-dia': {
    title: 'Corte por día y sucursal', group: 'Ventas', dated: true, roles: SALES_ROLES,
    description: 'Ventas, subtotal, IVA y total de cada día por sucursal, con efectivo y tarjeta.',
    columns: [col('Día', 'date'), col('Sucursal'), col('Ventas', 'int', true), col('Efectivo', 'money', true), col('Tarjeta', 'money', true),
      col('Transferencia', 'money', true), col('Subtotal', 'money', true), col('IVA 16 %', 'money', true), col('Total', 'money', true)],
    async rows(req) {
      const f = filters(req, { branchCol: 's.branch_id', dateCol: 's.created_at' });
      const { rows } = await query(
        `SELECT to_char(s.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, b.name AS branch, count(*)::int AS n,
                sum(s.total_cents) FILTER (WHERE s.payment_method = 'efectivo') AS cash,
                sum(s.total_cents) FILTER (WHERE s.payment_method = 'tarjeta') AS card,
                sum(s.total_cents) FILTER (WHERE s.payment_method = 'transferencia') AS transfer,
                sum(s.subtotal_cents) AS subtotal, sum(s.iva_cents) AS iva, sum(s.total_cents) AS total
           FROM sales s JOIN branches b ON b.id = s.branch_id
           ${f.where ? f.where + ' AND' : 'WHERE'} s.cancelled_at IS NULL
          GROUP BY 1, b.name, b.sort ORDER BY 1, b.sort`, f.params);
      return rows.map((x) => [x.day, x.branch, x.n, money(x.cash ?? 0), money(x.card ?? 0), money(x.transfer ?? 0),
        money(x.subtotal), money(x.iva), money(x.total)]);
    },
  },
  pedidos: {
    title: 'Pedidos en línea', group: 'Pedidos', dated: true,
    description: 'Pedidos con cliente, fecha para recoger, estado y total.',
    columns: [col('Folio'), col('Creado', 'datetime'), col('Sucursal'), col('Cliente'), col('Correo'), col('Teléfono'),
      col('Recoge', 'date'), col('Estado'), col('Piezas', 'int', true), col('Total', 'money', true), col('Notas')],
    async rows(req) {
      const f = filters(req, { branchCol: 'o.branch_id', dateCol: 'o.created_at' });
      const { rows } = await query(
        `SELECT o.folio, o.created_at, b.name AS branch, u.name, u.email, u.phone, to_char(o.pickup_date, 'YYYY-MM-DD') AS pickup,
                o.status, (SELECT COALESCE(sum(quantity), 0)::int FROM order_items WHERE order_id = o.id) AS pieces, o.total_cents, o.notes
           FROM orders o JOIN branches b ON b.id = o.branch_id JOIN users u ON u.id = o.user_id
           ${f.where} ORDER BY o.created_at LIMIT ${MAX_ROWS}`, f.params);
      return rows.map((o) => [o.folio, o.created_at, o.branch, o.name, o.email, o.phone, o.pickup, STATUS_LABEL[o.status] || o.status,
        o.pieces, money(o.total_cents), o.notes]);
    },
  },
  inventario: {
    title: 'Inventario actual', group: 'Inventario',
    description: 'Existencias de cada presentación por sucursal, con su valor a precio de venta.',
    columns: [col('Sucursal'), col('Categoría'), col('Producto'), col('Presentación'), col('Precio', 'money'),
      col('Existencias', 'int', true), col('Valor', 'money', true), col('Actualizado', 'datetime'), col('Por')],
    async rows(req) {
      const f = filters(req, { branchCol: 'b.id' });
      const { rows } = await query(
        `SELECT b.name AS branch, c.name AS category, p.name AS product, v.label, v.price_cents,
                COALESCE(i.quantity, 0) AS qty, i.updated_at, u.name AS updated_by
           FROM branches b
           CROSS JOIN product_variants v
           JOIN products p ON p.id = v.product_id AND p.active
           JOIN categories c ON c.id = p.category_id
           LEFT JOIN inventory i ON i.variant_id = v.id AND i.branch_id = b.id
           LEFT JOIN users u ON u.id = i.updated_by
           ${f.where ? f.where + ' AND' : 'WHERE'} b.active AND v.active
          ORDER BY b.sort, c.sort, p.sort, v.sort`, f.params);
      return rows.map((x) => [x.branch, x.category, x.product, x.label, money(x.price_cents), x.qty,
        money(x.price_cents * x.qty), x.updated_at, x.updated_by]);
    },
  },
  movimientos: {
    title: 'Movimientos de inventario', group: 'Inventario', dated: true,
    description: 'Entradas, salidas, ventas y cancelaciones con quién las hizo.',
    columns: [col('Fecha', 'datetime'), col('Sucursal'), col('Producto'), col('Presentación'), col('Movimiento', 'int'),
      col('Quedaron', 'int'), col('Motivo'), col('Usuario')],
    async rows(req) {
      const f = filters(req, { branchCol: 'm.branch_id', dateCol: 'm.created_at' });
      const { rows } = await query(
        `SELECT m.created_at, b.name AS branch, p.name AS product, v.label, m.delta, m.quantity_after, m.reason, u.name AS user_name
           FROM inventory_movements m
           JOIN branches b ON b.id = m.branch_id
           JOIN product_variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id
           LEFT JOIN users u ON u.id = m.user_id
           ${f.where} ORDER BY m.created_at, m.id LIMIT ${MAX_ROWS}`, f.params);
      return rows.map((x) => [x.created_at, x.branch, x.product, x.label, x.delta, x.quantity_after, x.reason, x.user_name]);
    },
  },
  catalogo: {
    title: 'Catálogo y precios', group: 'Catálogo',
    description: 'Todos los productos con sus presentaciones, porciones y precio.',
    columns: [col('Categoría'), col('Producto'), col('Presentación'), col('Porciones'), col('Precio', 'money'), col('Activo')],
    async rows() {
      const { rows } = await query(
        `SELECT c.name AS category, p.name AS product, v.label, v.serves, v.price_cents, (p.active AND v.active) AS active
           FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
          ORDER BY c.sort, p.sort, v.sort`);
      return rows.map((x) => [x.category, x.product, x.label, x.serves, money(x.price_cents), x.active ? 'Sí' : 'No']);
    },
  },
  calificaciones: {
    title: 'Calificaciones de clientes', group: 'Catálogo',
    description: 'Promedio de estrellas y número de votos por producto.',
    columns: [col('Categoría'), col('Producto'), col('Promedio'), col('Votos', 'int', true), col('5★', 'int'), col('4★', 'int'),
      col('3★', 'int'), col('2★', 'int'), col('1★', 'int')],
    async rows() {
      const { rows } = await query(
        `SELECT c.name AS category, p.name AS product, round(avg(r.stars), 2) AS avg, count(r.*)::int AS n,
                count(*) FILTER (WHERE r.stars = 5)::int AS s5, count(*) FILTER (WHERE r.stars = 4)::int AS s4,
                count(*) FILTER (WHERE r.stars = 3)::int AS s3, count(*) FILTER (WHERE r.stars = 2)::int AS s2,
                count(*) FILTER (WHERE r.stars = 1)::int AS s1
           FROM product_ratings r JOIN products p ON p.id = r.product_id JOIN categories c ON c.id = p.category_id
          GROUP BY c.name, c.sort, p.name, p.sort ORDER BY avg DESC, n DESC`);
      return rows.map((x) => [x.category, x.product, Number(x.avg).toFixed(2), x.n, x.s5, x.s4, x.s3, x.s2, x.s1]);
    },
  },
  usuarios: {
    title: 'Usuarios', group: 'Administración', roles: ['admin'],
    description: 'Personal y clientes con rol, sucursal, alta y último acceso.',
    columns: [col('Nombre'), col('Correo'), col('Teléfono'), col('Rol'), col('Sucursal'), col('Activo'), col('Alta', 'datetime'), col('Último acceso', 'datetime')],
    async rows() {
      const { rows } = await query(
        `SELECT u.name, u.email, u.phone, u.role, b.name AS branch, u.active, u.created_at, u.last_login_at
           FROM users u LEFT JOIN branches b ON b.id = u.branch_id
          ORDER BY (u.role = 'cliente'), u.name LIMIT ${MAX_ROWS}`);
      return rows.map((u) => [u.name, u.email, u.phone, ROLE[u.role], u.branch || 'Todas', u.active ? 'Sí' : 'No', u.created_at, u.last_login_at]);
    },
  },
};

const allowed = (rep, user) => !rep.roles || rep.roles.includes(user.role);

/** Lista de reportes que puede sacar este usuario. */
r.get('/', (req, res) => {
  res.json(Object.entries(REPORTS).filter(([, rep]) => allowed(rep, req.user))
    .map(([key, rep]) => ({ key, title: rep.title, group: rep.group, description: rep.description, dated: Boolean(rep.dated) })));
});

r.get('/:key', async (req, res) => {
  const rep = REPORTS[req.params.key];
  if (!rep) throw notFound('Reporte no encontrado.');
  if (!allowed(rep, req.user)) throw forbidden('Tu rol no puede sacar este reporte.');
  const rows = await rep.rows(req);
  const counted = rep.skipInTotals ? rows.filter((x) => !rep.skipInTotals(x)) : rows;
  const totals = rep.columns.some((c) => c.sum)
    ? rep.columns.map((c, i) => (c.sum ? Math.round(counted.reduce((t, x) => t + (Number(x[i]) || 0), 0) * 100) / 100 : null))
    : null;
  res.json({ key: req.params.key, title: rep.title, dated: Boolean(rep.dated), columns: rep.columns, rows, totals, truncated: rows.length >= MAX_ROWS });
});

export default r;
