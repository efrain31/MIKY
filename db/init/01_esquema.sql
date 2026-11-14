-- ==========================================================
-- Pastelerías Miky — esquema de base de datos (PostgreSQL 16)
-- Se ejecuta una sola vez, cuando el volumen de la BD está vacío.
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- Roles: el cliente compra; el personal opera según su rol.
--   ventas      → atiende pedidos (confirma, entrega, cancela) y consulta inventario
--   produccion  → prepara pedidos (en producción → listo) y consulta inventario
--   supervisor  → todo lo anterior + sube/baja inventario + edita textos e imágenes del sitio
--   admin       → todo + administra usuarios y roles
CREATE TYPE user_role AS ENUM ('cliente', 'ventas', 'produccion', 'supervisor', 'admin');

CREATE TYPE order_status AS ENUM ('nuevo', 'confirmado', 'en_produccion', 'listo', 'entregado', 'cancelado');

-- ---------- Catálogo ----------
CREATE TABLE branches (
  id          serial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  state       text NOT NULL,                 -- Colima | Jalisco
  address     text NOT NULL,
  phones      text[] NOT NULL DEFAULT '{}',
  photo       text,                          -- fachada (img/…)
  texture     text,                          -- textura de la franja en el sitio
  sort        int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE categories (
  id    serial PRIMARY KEY,
  slug  text NOT NULL UNIQUE,
  name  text NOT NULL,
  sort  int NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id                serial PRIMARY KEY,
  slug              text NOT NULL UNIQUE,
  category_id       int NOT NULL REFERENCES categories(id),
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',   -- corta (tarjetas)
  full_description  text,                       -- completa (ventana de detalle)
  image             text NOT NULL,              -- nombre en img/ sin extensión, o /uploads/…
  color             text NOT NULL DEFAULT '#d9c4b4',
  swatch_code       text NOT NULL DEFAULT '00-0000',
  swatch_tone       text NOT NULL DEFAULT '',
  featured          boolean NOT NULL DEFAULT true,
  active            boolean NOT NULL DEFAULT true,
  sort              int NOT NULL DEFAULT 0
);

-- Presentaciones (Grande, Mediano, Individual…) con su precio; el inventario es por presentación.
CREATE TABLE product_variants (
  id           serial PRIMARY KEY,
  product_id   int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label        text NOT NULL,
  serves       text,
  price_cents  int NOT NULL CHECK (price_cents >= 0),
  image        text,
  sort         int NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  UNIQUE (product_id, label)
);

-- ---------- Usuarios y sesiones ----------
CREATE TABLE users (
  id             serial PRIMARY KEY,
  email          citext NOT NULL UNIQUE,
  name           text NOT NULL,
  phone          text,
  password_hash  text NOT NULL,                -- scrypt$N$r$p$sal$hash (nunca la contraseña)
  role           user_role NOT NULL DEFAULT 'cliente',
  branch_id      int REFERENCES branches(id),  -- personal asignado a una sucursal (NULL = todas)
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

CREATE TABLE sessions (
  token_hash  bytea PRIMARY KEY,               -- sha256 del token de la cookie
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE favorites (
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE cart_items (
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id  int NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity    int NOT NULL CHECK (quantity > 0 AND quantity <= 50),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, variant_id)
);

-- ---------- Inventario por sucursal ----------
CREATE TABLE inventory (
  branch_id   int NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  variant_id  int NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity    int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  int REFERENCES users(id),
  PRIMARY KEY (branch_id, variant_id)
);

-- Bitácora de cada entrada/salida (ajustes manuales, pedidos, cancelaciones)
CREATE TABLE inventory_movements (
  id              bigserial PRIMARY KEY,
  branch_id       int NOT NULL REFERENCES branches(id),
  variant_id      int NOT NULL REFERENCES product_variants(id),
  delta           int NOT NULL,
  quantity_after  int NOT NULL,
  reason          text NOT NULL,
  order_id        int,
  user_id         int REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_branch_idx ON inventory_movements(branch_id, created_at DESC);

-- ---------- Pedidos (ticket para recoger en sucursal) ----------
CREATE SEQUENCE order_folio_seq START 1001;

CREATE TABLE orders (
  id           serial PRIMARY KEY,
  folio        text NOT NULL UNIQUE,
  user_id      int NOT NULL REFERENCES users(id),
  branch_id    int NOT NULL REFERENCES branches(id),
  status       order_status NOT NULL DEFAULT 'nuevo',
  pickup_date  date,
  notes        text,
  total_cents  int NOT NULL CHECK (total_cents >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_branch_status_idx ON orders(branch_id, status, created_at DESC);
CREATE INDEX orders_user_idx ON orders(user_id, created_at DESC);

CREATE TABLE order_items (
  id                serial PRIMARY KEY,
  order_id          int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id        int NOT NULL REFERENCES product_variants(id),
  product_name      text NOT NULL,             -- copia al momento de la compra
  variant_label     text NOT NULL,
  unit_price_cents  int NOT NULL,
  quantity          int NOT NULL CHECK (quantity > 0)
);

CREATE TABLE order_events (
  id          bigserial PRIMARY KEY,
  order_id    int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      order_status NOT NULL,
  user_id     int REFERENCES users(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Contenido editable del sitio (textos e imágenes) ----------
-- Sólo guarda lo que el admin/supervisor cambió; lo demás sale del HTML.
CREATE TABLE site_content (
  key         text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('text', 'image')),
  value       text NOT NULL,
  updated_by  int REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
