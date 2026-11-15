-- ==========================================================
-- Calificaciones de producto (1 a 5 estrellas), una por usuario y producto.
-- Si el usuario vuelve a calificar, se reemplaza su calificación anterior.
-- ==========================================================

CREATE TABLE product_ratings (
  product_id  int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars       smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, user_id)
);
