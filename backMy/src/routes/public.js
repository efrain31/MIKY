import { Router } from 'express';
import { query } from '../db.js';
import { productDto, branchDto } from '../format.js';
import { notFound } from '../errors.js';

const r = Router();

/** Catálogo completo: categorías → productos → presentaciones con precio. */
r.get('/catalog', async (_req, res) => {
  const [cats, prods, vars] = await Promise.all([
    query('SELECT id, slug, name FROM categories ORDER BY sort'),
    query(`SELECT p.*, c.slug AS category_slug, c.name AS category_name
             FROM products p JOIN categories c ON c.id = p.category_id
            WHERE p.active ORDER BY c.sort, p.sort, p.id`),
    query('SELECT * FROM product_variants WHERE active ORDER BY product_id, sort, id'),
  ]);
  const byProduct = Map.groupBy(vars.rows, (v) => v.product_id);
  const products = prods.rows.map((p) => productDto(p, byProduct.get(p.id) || []));
  res.set('Cache-Control', 'no-cache');
  res.json({
    categories: cats.rows.map((c) => ({ slug: c.slug, name: c.name })),
    products,
  });
});

r.get('/branches', async (_req, res) => {
  const { rows } = await query('SELECT * FROM branches WHERE active ORDER BY sort, id');
  res.json(rows.map(branchDto));
});

/** Existencias de una sucursal: { variantId: cantidad }. Se usa al elegir dónde recoger. */
r.get('/branches/:id/stock', async (req, res) => {
  const { rows: [b] } = await query('SELECT id FROM branches WHERE id = $1 AND active', [Number(req.params.id) || 0]);
  if (!b) throw notFound('Sucursal no encontrada.');
  const { rows } = await query('SELECT variant_id, quantity FROM inventory WHERE branch_id = $1', [b.id]);
  res.set('Cache-Control', 'no-store');
  res.json(Object.fromEntries(rows.map((x) => [x.variant_id, x.quantity])));
});

/** Textos e imágenes del sitio que el admin/supervisor cambió. */
r.get('/content', async (_req, res) => {
  const { rows } = await query('SELECT key, kind, value FROM site_content');
  res.set('Cache-Control', 'no-cache');
  res.json(Object.fromEntries(rows.map((x) => [x.key, { kind: x.kind, value: x.value }])));
});

export default r;
