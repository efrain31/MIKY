import { Router } from 'express';
import { query } from '../db.js';
import { productDto, branchDto } from '../format.js';
import { notFound, int } from '../errors.js';
import { ratingSummary } from '../ratings.js';

const r = Router();

// Lo público e igual para todos: Vercel lo guarda unos segundos en su borde y el navegador siempre revalida.
// Un cambio de precio, foto o texto tarda a lo mucho ese tiempo en verse.
const edgeCache = (res, seconds) =>
  res.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`);

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
  edgeCache(res, 60);
  res.json({
    categories: cats.rows.map((c) => ({ slug: c.slug, name: c.name })),
    products,
  });
});

r.get('/branches', async (_req, res) => {
  const { rows } = await query('SELECT * FROM branches WHERE active ORDER BY sort, id');
  edgeCache(res, 60);
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

/** Para la ventana de producto: existencias por presentación (total y por sucursal) y calificación.
 *  { stock: { variantId: { total, byBranch: { branchId: cantidad } } }, rating: { avg, count, mine } } */
r.get('/products/:id/summary', async (req, res) => {
  const id = int(req.params.id, { name: 'producto', min: 1 });
  const { rowCount } = await query('SELECT 1 FROM products WHERE id = $1 AND active', [id]);
  if (!rowCount) throw notFound('Producto no encontrado.');
  const [{ rows }, rating] = await Promise.all([
    query(`SELECT i.variant_id, i.branch_id, i.quantity
             FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN branches b ON b.id = i.branch_id
            WHERE v.product_id = $1 AND v.active AND b.active AND i.quantity > 0`, [id]),
    ratingSummary(id, req.user?.id),
  ]);
  const stock = {};
  for (const x of rows) {
    const s = (stock[x.variant_id] ??= { total: 0, byBranch: {} });
    s.total += x.quantity;
    s.byBranch[x.branch_id] = x.quantity;
  }
  res.set('Cache-Control', 'no-store');
  res.json({ stock, rating });
});

/** Textos e imágenes del sitio que el admin/supervisor cambió. */
r.get('/content', async (_req, res) => {
  const { rows } = await query('SELECT key, kind, value FROM site_content');
  edgeCache(res, 30);
  res.json(Object.fromEntries(rows.map((x) => [x.key, { kind: x.kind, value: x.value }])));
});

export default r;
