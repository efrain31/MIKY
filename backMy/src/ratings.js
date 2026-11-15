import { query } from './db.js';

/** Promedio (a un decimal), número de calificaciones y la del usuario (null si no ha calificado). */
export async function ratingSummary(productId, userId = null) {
  const { rows: [r] } = await query(
    `SELECT count(*)::int AS count, round(avg(stars), 1)::float AS avg,
            max(stars) FILTER (WHERE user_id = $2) AS mine
       FROM product_ratings WHERE product_id = $1`, [productId, userId]);
  return { avg: r.avg || 0, count: r.count, mine: r.mine ?? null };
}
