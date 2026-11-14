import { Router } from 'express';
import { query } from '../db.js';
import { requireRole, EDITORS } from '../auth.js';
import { badRequest, notFound, int, str } from '../errors.js';
import { pesos } from '../format.js';
import {
  IVA_RATE, PAYMENT, CHANNEL, SALE_SELECT, saleDto, loadSale, salesFilter, createCounterSale, annulSale,
} from '../sales.js';

const r = Router();
r.use(requireRole('ventas', 'supervisor', 'admin'));

const live = (where) => [...where, 's.cancelled_at IS NULL'];
const W = (where) => (where.length ? `WHERE ${where.join(' AND ')}` : '');

/** Resumen: totales con desglose de IVA, por sucursal, por método de pago, por día y productos más vendidos. */
r.get('/summary', async (req, res) => {
  const { params, where } = salesFilter(req.user, req.query);
  const [tot, byBranch, byPay, byChannel, byDay, top, annulled] = await Promise.all([
    query(`SELECT count(*)::int AS n, COALESCE(sum(total_cents),0)::bigint AS total, COALESCE(sum(subtotal_cents),0)::bigint AS subtotal, COALESCE(sum(iva_cents),0)::bigint AS iva
             FROM sales s ${W(live(where))}`, params),
    query(`SELECT b.id, b.name, count(*)::int AS n, sum(s.total_cents)::bigint AS total, sum(s.subtotal_cents)::bigint AS subtotal, sum(s.iva_cents)::bigint AS iva
             FROM sales s JOIN branches b ON b.id = s.branch_id ${W(live(where))} GROUP BY b.id, b.name, b.sort ORDER BY total DESC`, params),
    query(`SELECT payment_method AS k, count(*)::int AS n, sum(total_cents)::bigint AS total FROM sales s ${W(live(where))} GROUP BY 1 ORDER BY total DESC`, params),
    query(`SELECT channel AS k, count(*)::int AS n, sum(total_cents)::bigint AS total FROM sales s ${W(live(where))} GROUP BY 1 ORDER BY total DESC`, params),
    query(`SELECT to_char(s.created_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS day, count(*)::int AS n, sum(s.total_cents)::bigint AS total
             FROM sales s ${W(live(where))} GROUP BY 1 ORDER BY 1`, params),
    query(`SELECT i.product_name AS product, i.variant_label AS size, sum(i.quantity)::int AS qty, sum(i.quantity * i.unit_price_cents)::bigint AS total
             FROM sale_items i JOIN sales s ON s.id = i.sale_id ${W(live(where))}
            GROUP BY 1, 2 ORDER BY qty DESC, total DESC LIMIT 8`, params),
    query(`SELECT count(*)::int AS n, COALESCE(sum(total_cents),0)::bigint AS total FROM sales s ${W([...where, 's.cancelled_at IS NOT NULL'])}`, params),
  ]);
  const t = tot.rows[0];
  const money = (x) => pesos(Number(x));
  res.json({
    ivaRate: IVA_RATE,
    totals: {
      count: t.n, total: money(t.total), subtotal: money(t.subtotal), iva: money(t.iva),
      average: t.n ? money(Number(t.total) / t.n) : 0,
    },
    byBranch: byBranch.rows.map((x) => ({ id: x.id, name: x.name, count: x.n, total: money(x.total), subtotal: money(x.subtotal), iva: money(x.iva) })),
    byPayment: byPay.rows.map((x) => ({ key: x.k, label: PAYMENT[x.k], count: x.n, total: money(x.total) })),
    byChannel: byChannel.rows.map((x) => ({ key: x.k, label: CHANNEL[x.k], count: x.n, total: money(x.total) })),
    byDay: byDay.rows.map((x) => ({ day: x.day, count: x.n, total: money(x.total) })),
    top: top.rows.map((x) => ({ product: x.product, size: x.size, quantity: x.qty, total: money(x.total) })),
    annulled: { count: annulled.rows[0].n, total: money(annulled.rows[0].total) },
  });
});

/** Listado de ventas (incluye anuladas, marcadas). */
r.get('/', async (req, res) => {
  const { params, where } = salesFilter(req.user, req.query);
  const { rows } = await query(`${SALE_SELECT} ${W(where)} ORDER BY s.created_at DESC LIMIT 300`, params);
  res.json(rows.map((s) => saleDto(s)));
});

/** Exportación para contabilidad (CSV que abre bien en Excel, con acentos). */
r.get('/export.csv', async (req, res) => {
  const { params, where } = salesFilter(req.user, req.query);
  const { rows } = await query(
    `${SALE_SELECT} ${W(where)} ORDER BY s.created_at`, params);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fmt = (c) => (c / 100).toFixed(2);
  const lines = [['Folio', 'Fecha', 'Hora', 'Sucursal', 'Canal', 'Método de pago', 'Cliente', 'Atendió', 'Subtotal', 'IVA 16%', 'Total', 'Estado', 'Motivo de anulación'].map(cell).join(',')];
  for (const s of rows) {
    const d = new Date(s.created_at);
    lines.push([
      s.folio,
      d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }),
      d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }),
      s.branch_name, CHANNEL[s.channel], PAYMENT[s.payment_method], s.customer_name, s.user_name,
      fmt(s.subtotal_cents), fmt(s.iva_cents), fmt(s.total_cents),
      s.cancelled_at ? 'Anulada' : 'Vigente', s.cancel_reason,
    ].map(cell).join(','));
  }
  const name = `ventas-miky_${req.query.from || 'inicio'}_${req.query.to || 'hoy'}.csv`;
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
  res.send('﻿' + lines.join('\r\n'));
});

r.get('/:id', async (req, res) => {
  const sale = await loadSale(int(req.params.id, { name: 'venta', min: 1 }));
  if (!sale || (req.user.branch_id && sale.branch.id !== req.user.branch_id)) throw notFound('Venta no encontrada.');
  res.json(sale);
});

/** Venta en mostrador. */
r.post('/', async (req, res) => {
  const branchId = req.user.branch_id || int(req.body.branchId, { name: 'la sucursal', min: 1 });
  const sale = await createCounterSale(req.user, {
    branchId, items: req.body.items, paymentMethod: req.body.paymentMethod,
    customerName: str(req.body.customerName, { name: 'el cliente', max: 80, optional: true }),
  });
  res.status(201).json(sale);
});

/** Anular (supervisor y admin). */
r.post('/:id/annul', requireRole(...EDITORS), async (req, res) => {
  const reason = str(req.body.reason, { name: 'el motivo', min: 3, max: 200 });
  if (typeof req.body.restock !== 'boolean') throw badRequest('Indica si las piezas regresan al inventario.');
  res.json(await annulSale(req.user, int(req.params.id, { name: 'venta', min: 1 }), { reason, restock: req.body.restock }));
});

export default r;
