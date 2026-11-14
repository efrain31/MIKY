-- ==========================================================
-- EXISTENCIAS DE DEMOSTRACIÓN — NO son datos reales.
-- Sirven para probar pedidos. Bórralo (o vacía la tabla inventory) antes de producción
-- y captura las existencias reales desde el panel (rol admin o supervisor).
-- ==========================================================
INSERT INTO inventory (branch_id, variant_id, quantity)
SELECT b.id, v.id,
       -- cantidad determinista entre 0 y 8 para que algunas presentaciones salgan agotadas
       ((b.id * 7 + v.id * 3) % 9)
FROM branches b CROSS JOIN product_variants v;

INSERT INTO inventory_movements (branch_id, variant_id, delta, quantity_after, reason)
SELECT branch_id, variant_id, quantity, quantity, 'Carga inicial de demostración' FROM inventory WHERE quantity > 0;
