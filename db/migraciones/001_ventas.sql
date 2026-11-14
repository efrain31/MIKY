-- ==========================================================
-- Registro de ventas por sucursal con desglose de IVA (16 %)
-- Los precios del catálogo YA incluyen IVA: subtotal = total / 1.16, IVA = total − subtotal.
-- Una venta nace cuando:
--   • un pedido en línea se marca «Entregado» (se paga al recoger), o
--   • el personal registra una venta en mostrador desde el panel.
-- ==========================================================

CREATE TYPE sale_channel AS ENUM ('en_linea', 'mostrador');
CREATE TYPE payment_method AS ENUM ('efectivo', 'tarjeta', 'transferencia');

CREATE SEQUENCE sale_folio_seq START 1001;

CREATE TABLE sales (
  id               serial PRIMARY KEY,
  folio            text NOT NULL UNIQUE,              -- MK-… si viene de un pedido, MV-… si es de mostrador
  branch_id        int NOT NULL REFERENCES branches(id),
  channel          sale_channel NOT NULL,
  order_id         int UNIQUE REFERENCES orders(id),  -- un pedido sólo genera una venta
  payment_method   payment_method NOT NULL,
  customer_name    text,
  iva_rate         numeric(5, 4) NOT NULL DEFAULT 0.16,
  subtotal_cents   int NOT NULL CHECK (subtotal_cents >= 0),
  iva_cents        int NOT NULL CHECK (iva_cents >= 0),
  total_cents      int NOT NULL CHECK (total_cents >= 0),
  user_id          int REFERENCES users(id),          -- quién la registró / entregó
  created_at       timestamptz NOT NULL DEFAULT now(),
  cancelled_at     timestamptz,
  cancelled_by     int REFERENCES users(id),
  cancel_reason    text,
  CHECK (subtotal_cents + iva_cents = total_cents)
);
CREATE INDEX sales_branch_date_idx ON sales(branch_id, created_at DESC);
CREATE INDEX sales_date_idx ON sales(created_at DESC);

CREATE TABLE sale_items (
  id                serial PRIMARY KEY,
  sale_id           int NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id        int NOT NULL REFERENCES product_variants(id),
  product_name      text NOT NULL,
  variant_label     text NOT NULL,
  unit_price_cents  int NOT NULL,
  quantity          int NOT NULL CHECK (quantity > 0)
);
CREATE INDEX sale_items_sale_idx ON sale_items(sale_id);
