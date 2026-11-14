#!/usr/bin/env python3
"""Genera los SQL de carga inicial a partir de catalogo.json.

Uso:  python3 db/catalogo/generar_seed.py
Salida:
  db/init/02_catalogo.sql          categorías, sucursales, productos y presentaciones (datos reales)
  db/init/03_inventario_demo.sql   existencias DE DEMOSTRACIÓN por sucursal (bórralo antes de producción)
"""
import json
from pathlib import Path

AQUI = Path(__file__).resolve().parent
INIT = AQUI.parent / "init"
cat = json.loads((AQUI / "catalogo.json").read_text(encoding="utf-8"))
RINDE = cat["rinde"]


def q(v):
    """Literal SQL seguro (texto, número o NULL)."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def arr(items):
    return "ARRAY[" + ", ".join(q(i) for i in items) + "]::text[]" if items else "'{}'::text[]"


out = ["-- Generado por db/catalogo/generar_seed.py a partir de catalogo.json — no editar a mano.", ""]

out.append("INSERT INTO categories (slug, name, sort) VALUES")
out.append(",\n".join(f"  ({q(c['slug'])}, {q(c['name'])}, {i})" for i, c in enumerate(cat["categorias"])) + ";\n")

out.append("INSERT INTO branches (slug, name, state, address, phones, photo, texture, sort) VALUES")
out.append(",\n".join(
    f"  ({q(s['slug'])}, {q(s['name'])}, {q(s['state'])}, {q(s['addr'])}, {arr(s['tel'])}, {q(s['photo'])}, {q(s['tex'])}, {i})"
    for i, s in enumerate(cat["sucursales"])) + ";\n")

for i, p in enumerate(cat["productos"]):
    out.append(
        "INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)\n"
        f"  SELECT {q(p['slug'])}, id, {q(p['name'])}, {q(p['desc'])}, {q(p.get('full'))}, {q(p['img'])}, "
        f"{q(p['color'])}, {q(p['code'])}, {q(p['tone'])}, {i} FROM categories WHERE slug = {q(p['cat'])};")
    rows = []
    for j, s in enumerate(p["sizes"]):
        label, serves, price = s[0], s[1], s[2]
        img = s[3] if len(s) > 3 else None
        serves = RINDE.get(serves, serves) if serves else None
        rows.append(f"  ({q(label)}, {q(serves)}, {price * 100}, {q(img)}, {j})")
    out.append("INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)\n"
               f"  SELECT (SELECT id FROM products WHERE slug = {q(p['slug'])}), v.* FROM (VALUES\n"
               + ",\n".join(rows) + "\n  ) AS v(label, serves, price_cents, image, sort);\n")

(INIT / "02_catalogo.sql").write_text("\n".join(out) + "\n", encoding="utf-8")

demo = """-- ==========================================================
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
"""
(INIT / "03_inventario_demo.sql").write_text(demo, encoding="utf-8")

print(f"{len(cat['productos'])} productos, {sum(len(p['sizes']) for p in cat['productos'])} presentaciones, "
      f"{len(cat['sucursales'])} sucursales → {INIT}")
