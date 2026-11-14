-- Generado por db/catalogo/generar_seed.py a partir de catalogo.json — no editar a mano.

INSERT INTO categories (slug, name, sort) VALUES
  ('pasteles', 'Pasteles', 0),
  ('pays', 'Pays', 1),
  ('postres', 'Postres', 2),
  ('helados', 'Helados', 3),
  ('bebidas', 'Bebidas', 4);

INSERT INTO branches (slug, name, state, address, phones, photo, texture, sort) VALUES
  ('sevilla-del-rio', 'Sevilla del Río', 'Colima', 'Felipe Sevilla del Río 452-1, Lomas de Circunvalación, 28010 Colima, Col.', ARRAY['312 313 3882']::text[], 'suc-sevilla', 'tex-tartaleta', 0),
  ('benito-juarez', 'Benito Juárez', 'Colima', 'Av. Benito Juárez 186, La Gloria, 28980 Villa de Álvarez, Col.', ARRAY['312 396 6505']::text[], 'suc-juarez', 'tex-cereza', 1),
  ('plaza-stella', 'V. Carranza (Plaza Stella)', 'Colima', 'Av. Venustiano Carranza 2220, Local 2, Residencial Esmeralda Nte., 28017 Colima, Col.', ARRAY['33 1845 9691']::text[], 'suc-carranza', 'tex-nuez', 2),
  ('pablo-silva', 'Pablo Silva', 'Colima', 'Av. Pablo Silva García 176, Villas Providencia, 28986 Villa de Álvarez, Col.', ARRAY['312 311 6477']::text[], NULL, 'tex-tresleches', 3),
  ('constitucion', 'Constitución', 'Colima', 'Av. Constitución 1625-A, Jardines Vista Hermosa III, 28017 Colima, Col.', ARRAY['312 323 4498']::text[], 'suc-constitucion', 'tex-aleman', 4),
  ('real-hacienda', 'Real Hacienda', 'Colima', 'Prol. Hidalgo 923-A, Real Hacienda, 28978 Villa de Álvarez, Col.', ARRAY['312 315 4898']::text[], NULL, 'tex-cerezas', 5),
  ('ciudad-granja', 'Matriz Ciudad Granja', 'Jalisco', 'Av. San Juan 139, Ciudad Granja, 45010 Zapopan, Jal.', ARRAY['33 1657 2947', '33 3629 1574']::text[], 'suc-granja', 'tex-nuez', 6),
  ('la-estancia', 'La Estancia', 'Jalisco', 'Av. Rafael Sanzio 309-B, La Estancia, 45030 Zapopan, Jal.', ARRAY['33 1816 9797']::text[], 'suc-estancia', 'tex-tartaleta', 7),
  ('ciudad-guzman', 'Ciudad Guzmán', 'Jalisco', 'C. Miguel Hidalgo y Costilla 226, Centro, 49000 Zapotlán el Grande, Jal.', ARRAY['341 269 6106']::text[], NULL, 'tex-cerezas', 8);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'red-velvet', id, 'Red Velvet', 'Mermelada de fresa al centro, un toque ligero de chocolate y cobertura de queso crema.', 'Postre elaborado con mermelada de fresa al centro, con un toque ligero sabor chocolate y una cobertura hecha a base de queso crema.', 'red-velvet', '#b23a3e', '18-1655', 'Terciopelo', 0 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'red-velvet'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 68000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 57000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'zanahoria', id, 'Zanahoria', 'Suave pastel de zanahorias frescas, trozos de nuez, un toque de especias y cobertura de queso crema.', 'Disfruta de nuestro suave pastel elaborado con frescas zanahorias, trozos de nuez, un exótico toque de especias y una cobertura de rico queso crema.', 'zanahoria', '#e07b39', '16-1448', 'Mandarina', 1 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'zanahoria'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 72000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 51000, NULL, 1),
  ('Mini', '3 – 4 porciones', 24000, 'zanahoria-mini', 2),
  ('Individual', '1 porción', 11000, 'zanahoria-ind', 3)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'zanahoria-splenda', id, 'Zanahoria Splenda', 'Harina integral, zanahoria fresca, nuez y cobertura de queso crema endulzada con Splenda.', 'Elaborado con harina integral, zanahoria fresca, con trozos de nuez y cobertura de queso crema endulzado totalmente con Splenda.', 'zanahoria-splenda', '#d98a4e', '16-1340', 'Integral', 2 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'zanahoria-splenda'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 73000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 56000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pina-zanahoria', id, 'Piña Zanahoria', 'Pastel de zanahoria con piña, nuez y cobertura de queso crema.', NULL, 'pina-zanahoria', '#e3a64a', '15-1147', 'Piña', 3 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pina-zanahoria'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 72000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 51000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'chocolate-aleman', id, 'Chocolate Alemán', 'Elaborado con chocolate de sabor ligero, coco fresco y nuez.', NULL, 'chocolate-aleman', '#8a5236', '18-1244', 'Coco tostado', 4 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'chocolate-aleman'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 82000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 60000, 'chocolate-aleman-med', 1),
  ('Individual', '1 porción', 11000, 'chocolate-aleman-ind', 2)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'chocolate-americano', id, 'Chocolate Americano', 'Cocoa especial y una cobertura de delicioso chocolate.', 'Elaborado con cocoa especial, este suculento pastel tiene una cobertura de delicioso chocolate.', 'chocolate-americano', '#4a2c22', '19-1420', 'Cacao', 5 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'chocolate-americano'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 72000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 51000, NULL, 1),
  ('Mini', '3 – 4 porciones', 24000, 'chocolate-americano-mini', 2),
  ('Individual', '1 porción', 11000, 'chocolate-americano-ind', 3)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'chocolate-suizo', id, 'Chocolate Suizo', 'Pan de chocolate oscuro con crema batida, durazno y un toque de licor, cubierto con chocolate macizo.', 'Exquisito pan de chocolate oscuro relleno con crema batida, durazno y un toque ligero de licor, cubierto con chocolate macizo.', 'chocolate-suizo', '#5b3a29', '19-1218', 'Chocolate amargo', 6 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'chocolate-suizo'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 68000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 57000, 'chocolate-suizo-med', 1),
  ('Individual', '1 porción', 11000, 'chocolate-suizo-ind', 2)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'marmoleado', id, 'Marmoleado', 'Chocolate con vainilla, un toque ligero de café y cubierta de queso crema.', 'Combinación de chocolate con vainilla, un toque ligero de café, y una cubierta de delicioso queso crema.', 'marmoleado', '#a07a62', '17-1230', 'Moka', 7 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'marmoleado'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 68000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 57000, 'marmoleado-med', 1),
  ('Individual', '1 porción', 11000, 'marmoleado-ind', 2)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'tres-leches-fresa', id, 'Tres Leches Fresa', 'Dos capas de esponjoso pastel de vainilla, relleno de crema batida y cubierto con fresas.', 'Suave y cremosa consistencia formada por dos capas de esponjoso pastel de vainilla cubierto con exquisitas fresas y con un delicioso relleno de crema batida.', 'tres-leches-fresa', '#d9545b', '17-1755', 'Fresa', 8 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'tres-leches-fresa'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 78000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 64000, 'tres-leches-fresa-med', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'tres-leches-vainilla', id, 'Tres Leches Vainilla', 'Pan de vainilla bañado con tres leches y un ligero toque de brandy.', 'Pan de vainilla suave y cremoso, bañado con tres leches y un ligero toque de brandy.', 'tres-leches-vainilla', '#e8d8a8', '12-0822', 'Vainilla', 9 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'tres-leches-vainilla'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 69000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 54000, NULL, 1),
  ('Individual', '1 porción', 11000, 'tres-leches-vainilla-ind', 2)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'tres-leches-capuchino', id, 'Tres Leches Capuchino', 'Pastel de vainilla bañado en tres leches con sabor café capuchino.', 'Suave pastel de vainilla bañado con nuestra deliciosa receta de tres leches y sabor café capuchino.', 'tres-leches-capuchino', '#b08968', '16-1221', 'Capuchino', 10 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'tres-leches-capuchino'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 75000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 64000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'tres-leches-chocolate', id, 'Tres Leches Chocolate', 'Dos capas de esponjoso pastel de chocolate relleno de crema batida.', 'Suave y cremosa consistencia formada por dos capas de esponjoso pastel de chocolate relleno de crema batida.', 'tres-leches-chocolate', '#6e4a3a', '19-1230', 'Chocolate', 11 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'tres-leches-chocolate'), v.* FROM (VALUES
  ('Mediano', '8 – 10 porciones', 56000, NULL, 0)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'queso-cereza', id, 'Queso Cereza', 'Crema estilo Nueva York sobre costra de galleta, con cerezas frescas y mermelada.', 'Suculento pastel a base de crema estilo Nueva York, sobre una costra de rica galleta. Cubierto con cerezas frescas y mermelada especial.', 'queso-cereza', '#a2242f', '19-1663', 'Cereza', 12 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'queso-cereza'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 85000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 64000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'queso-fresa', id, 'Queso Fresa', 'Crema estilo Nueva York sobre costra de galleta, con fresas frescas y mermelada.', 'Suculento pastel a base de crema estilo Nueva York sobre una costra de galleta. Cubierto con fresas frescas y mermelada especial.', 'queso-fresa', '#d8434f', '18-1660', 'Fresa roja', 13 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'queso-fresa'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 89000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 64000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'queso-blueberry', id, 'Queso Blueberry', 'Crema estilo Nueva York sobre costra de galleta, con blueberry fresco y mermelada.', 'Suculento pastel a base de crema estilo Nueva York, sobre una costra de rica galleta. Cubierto con blueberry fresco y mermelada especial.', 'queso-blueberry', '#3b3a6b', '19-3950', 'Blueberry', 14 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'queso-blueberry'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 81000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 64000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'queso-zarzamora', id, 'Queso Zarzamora', 'Crema estilo Nueva York sobre costra de galleta, con zarzamoras y mermelada.', 'Suculento pastel a base de crema estilo Nueva York, sobre una costra de rica galleta. Cubierto con zarzamora fresca y mermelada especial.', 'queso-zarzamora', '#5c1f3a', '19-2420', 'Zarzamora', 15 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'queso-zarzamora'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 89000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 64000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pastel-manzana', id, 'Pastel de Manzana', 'Pastel coronado con rebanadas de manzana caramelizada.', NULL, 'pastel-manzana', '#d9a441', '15-1142', 'Manzana dorada', 16 FROM categories WHERE slug = 'pasteles';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pastel-manzana'), v.* FROM (VALUES
  ('Grande', '12 – 16 porciones', 68000, NULL, 0),
  ('Mediano', '8 – 10 porciones', 57000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-limon', id, 'Pay de Limón', 'Relleno agridulce de jugosos limones cubierto con un suculento merengue horneado.', 'Con delicioso relleno agridulce elaboramos nuestros pays con jugosos limones y los cubrimos con un suculento merengue horneado.', 'pay-limon', '#e8c48f', '13-1025', 'Merengue tostado', 17 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-limon'), v.* FROM (VALUES
  ('Grande', '8 personas', 31000, NULL, 0),
  ('Individual', '1 persona', 8000, 'pay-limon-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-limon-crema', id, 'Pay de Limón Crema', 'Pay cremoso de limón con costra crujiente.', NULL, 'pay-limon-crema', '#f1e3a6', '12-0825', 'Limón crema', 18 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-limon-crema'), v.* FROM (VALUES
  ('Grande', '8 personas', 46000, NULL, 0),
  ('Individual', '1 persona', 9000, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-cereza', id, 'Pay de Queso Cereza', 'Queso crema sobre costra de galleta, coronado con cerezas frescas.', 'Deléitate con nuestro exquisito pay de queso crema con costra de deliciosa galleta coronado con ricas y frescas cerezas.', 'pay-cereza', '#a2242f', '19-1662', 'Cereza', 19 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-cereza'), v.* FROM (VALUES
  ('Grande', '8 personas', 52000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-cereza-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-fresa', id, 'Pay de Queso Fresa', 'Queso crema sobre costra de galleta, coronado con fresas frescas.', 'Deléitate con nuestro exquisito pay de queso crema con costra de deliciosa galleta coronado con fresas frescas.', 'pay-fresa', '#e0525c', '17-1753', 'Fresa', 20 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-fresa'), v.* FROM (VALUES
  ('Grande', '8 personas', 52000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-fresa-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-blueberry', id, 'Pay de Queso Blueberry', 'Pay de queso con costra crujiente de galleta y cobertura de blueberry.', 'Deléitate con nuestro exquisito pay de queso y su crujiente costra de galleta. Su cobertura de blueberry es el toque perfecto.', 'pay-blueberry', '#3b3a6b', '19-3951', 'Blueberry', 21 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-blueberry'), v.* FROM (VALUES
  ('Grande', '8 personas', 52000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-blueberry-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-zarzamora', id, 'Pay de Queso Zarzamora', 'Queso crema sobre costra de galleta, coronado con zarzamoras frescas.', 'Deléitate con nuestro exquisito pay de queso crema con costra de deliciosa galleta y coronado con ricas y frescas zarzamoras.', 'pay-zarzamora', '#5c1f3a', '19-2421', 'Zarzamora', 22 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-zarzamora'), v.* FROM (VALUES
  ('Grande', '8 personas', 52000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-zarzamora-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-coco', id, 'Pay de Coco', 'Crema de coco natural fresco, decorado con crema batida y coco rallado.', 'Hecho a base de una suculenta crema de coco natural fresco. Decorado con riquísima crema batida y coco rallado.', 'pay-coco', '#efe6d6', '11-0507', 'Coco', 23 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-coco'), v.* FROM (VALUES
  ('Grande', '8 personas', 46000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-coco-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-manzana', id, 'Pay de Manzana', 'Estilo francés, con manzana natural y canela bajo una pasta crujiente.', 'Pay estilo francés con relleno de manzana natural y canela cubierto de deliciosa pasta crujiente.', 'pay-manzana', '#c9853f', '16-1342', 'Canela', 24 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-manzana'), v.* FROM (VALUES
  ('Grande', '8 personas', 44000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-manzana-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-nuez', id, 'Pay de Nuez', 'Relleno acaramelado y cubierta de selectas nueces.', 'Su delicioso relleno acaramelado y su cubierta de selectas nueces hacen de este pay una delicia para degustar.', 'pay-nuez', '#7a4a2c', '18-1250', 'Nuez', 25 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-nuez'), v.* FROM (VALUES
  ('Grande', '8 personas', 44000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-nuez-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-chocolate', id, 'Pay de Chocolate', 'Crema de cacao oscuro, crema natural batida y chocolate rallado.', 'Elaborado con crema de cacao oscuro, decorado con crema natural batida y chocolate rallado.', 'pay-chocolate', '#6b4a3a', '19-1322', 'Cacao oscuro', 26 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-chocolate'), v.* FROM (VALUES
  ('Grande', '8 personas', 46000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-chocolate-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'pay-platano', id, 'Pay de Plátano', 'Rebanadas de plátano natural bajo crema de vainilla y crema batida.', 'Rebanadas de plátano natural, bajo una deliciosa crema de vainilla y decorado con rica crema batida.', 'pay-platano', '#f0d58a', '13-0755', 'Plátano', 27 FROM categories WHERE slug = 'pays';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'pay-platano'), v.* FROM (VALUES
  ('Grande', '8 personas', 46000, NULL, 0),
  ('Individual', '1 persona', 9000, 'pay-platano-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'tartaleta', id, 'Tartaleta', 'Costra crujiente con sabor a almendra, crema de vainilla y frutas naturales.', 'Deliciosa y crujiente costra con sabor a almendra, acompañada de crema de vainilla y una fresca cobertura de frutas naturales.', 'tartaleta', '#f2a541', '15-1153', 'Durazno', 28 FROM categories WHERE slug = 'postres';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'tartaleta'), v.* FROM (VALUES
  ('Grande', '6 personas', 37000, NULL, 0),
  ('Individual', '1 persona', 11000, 'tartaleta-ind', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'flan-napolitano', id, 'Flan Napolitano', 'Elaborado con queso crema y bañado con rico caramelo.', 'Delicioso postre elaborado con queso crema bañado con rico caramelo.', 'flan', '#b06a2a', '17-1145', 'Caramelo', 29 FROM categories WHERE slug = 'postres';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'flan-napolitano'), v.* FROM (VALUES
  ('Grande', '10 personas', 48000, NULL, 0)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'gelatina-de-leche', id, 'Gelatina de Leche', 'Gelatina de vainilla y limón decorada con rodajas de durazno.', 'Fresca combinación de gelatina de vainilla y limón decorada con ricas rodajas de durazno.', 'gelatina', '#f3e3a0', '12-0815', 'Vainilla', 30 FROM categories WHERE slug = 'postres';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'gelatina-de-leche'), v.* FROM (VALUES
  ('Grande', '10 personas', 39000, NULL, 0)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'brownies', id, 'Brownies', 'Denso chocolate relleno con nueces. Caja con 16 piezas de puro sabor.', 'Para quienes les encanta una deliciosa textura de denso chocolate relleno con nueces, les ofrecemos nuestros exquisitos brownies.', 'brownies-16', '#3e2a22', '19-1314', 'Brownie', 31 FROM categories WHERE slug = 'postres';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'brownies'), v.* FROM (VALUES
  ('Caja', '16 piezas', 46000, NULL, 0),
  ('Pieza', '1 brownie', 3900, 'brownie', 1)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'mostachon', id, 'Mostachón', 'Base de mostachón con crema batida y frutos rojos.', NULL, 'mostachon', '#c0566a', '17-1928', 'Frutos rojos', 32 FROM categories WHERE slug = 'postres';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'mostachon'), v.* FROM (VALUES
  ('Pieza', NULL, 30000, NULL, 0)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'muffins', id, 'Muffins', 'Zanahoria, chocolate americano o red velvet.', NULL, 'muffin-red', '#8c2f39', '19-1557', 'Muffin', 33 FROM categories WHERE slug = 'postres';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'muffins'), v.* FROM (VALUES
  ('Red Velvet', NULL, 3500, 'muffin-red', 0),
  ('Chocolate', NULL, 3500, 'muffin-chocolate', 1),
  ('Zanahoria', NULL, 3500, 'muffin-zanahoria', 2)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'panque-platano', id, 'Panqué de Plátano', 'Elaborado a base de plátano natural.', NULL, 'panque-platano', '#9b6b45', '18-1137', 'Panqué', 34 FROM categories WHERE slug = 'postres';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'panque-platano'), v.* FROM (VALUES
  ('Pieza', NULL, 18000, NULL, 0)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'panque-manzana', id, 'Panqué de Manzana', 'Elaborado a base de manzanas naturales; su textura y sabor te enamorarán.', NULL, 'panque-manzana', '#c49a62', '16-1336', 'Manzana horneada', 35 FROM categories WHERE slug = 'postres';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'panque-manzana'), v.* FROM (VALUES
  ('Pieza', NULL, 24000, NULL, 0)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'helado-clasico', id, 'Helado Clásico', 'Helado hecho con los mejores ingredientes locales y recetas únicas.', NULL, 'helados', '#f2b8c6', '13-2004', 'Fresa', 36 FROM categories WHERE slug = 'helados';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'helado-clasico'), v.* FROM (VALUES
  ('1 litro', NULL, 15000, NULL, 0),
  ('½ litro', NULL, 9000, NULL, 1),
  ('Doble (200 g)', NULL, 4800, 'helado-copa', 2),
  ('Sencillo (100 g)', NULL, 3000, 'helado-copa', 3)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'helado-especial', id, 'Helado Especial', 'Sabores coco, nuez, café y vainilla.', NULL, 'helados', '#e9dcc4', '12-0910', 'Coco, nuez, café y vainilla', 37 FROM categories WHERE slug = 'helados';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'helado-especial'), v.* FROM (VALUES
  ('1 litro', NULL, 22500, NULL, 0),
  ('½ litro', NULL, 13500, NULL, 1),
  ('Doble (200 g)', NULL, 7200, 'helado-copa', 2),
  ('Sencillo (100 g)', NULL, 4500, 'helado-copa', 3)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'cafe', id, 'Café', 'Americano, espresso o latte para acompañar tu rebanada favorita.', NULL, 'americano', '#6f4a33', '19-1220', 'Espresso', 38 FROM categories WHERE slug = 'bebidas';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'cafe'), v.* FROM (VALUES
  ('Americano', NULL, 3800, NULL, 0),
  ('Espresso', NULL, 3500, NULL, 1),
  ('Latte', NULL, 5900, NULL, 2)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'capuchino', id, 'Capuchino', 'Clásico, moka o con un toque de Kahlúa.', NULL, 'capuchino', '#c8a882', '15-1214', 'Espuma', 39 FROM categories WHERE slug = 'bebidas';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'capuchino'), v.* FROM (VALUES
  ('Capuchino', NULL, 5900, NULL, 0),
  ('Moka', NULL, 6400, NULL, 1),
  ('Kahlúa', NULL, 6800, NULL, 2)
  ) AS v(label, serves, price_cents, image, sort);

INSERT INTO products (slug, category_id, name, description, full_description, image, color, swatch_code, swatch_tone, sort)
  SELECT 'chocolate-chai', id, 'Chocolate y Chai', 'Chocolate caliente o un chai especiado.', NULL, 'frappe', '#8b5a3c', '18-1238', 'Chai', 40 FROM categories WHERE slug = 'bebidas';
INSERT INTO product_variants (product_id, label, serves, price_cents, image, sort)
  SELECT (SELECT id FROM products WHERE slug = 'chocolate-chai'), v.* FROM (VALUES
  ('Chocolate', NULL, 3500, NULL, 0),
  ('Chai', NULL, 6500, NULL, 1)
  ) AS v(label, serves, price_cents, image, sort);

