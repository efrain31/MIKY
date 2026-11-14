# Pastelerías Miky — sitio, tienda y panel de operación

Monorepo con tres partes que corren juntas en Docker:

```
miky/
├── front/                 Sitio público + panel del personal (HTML, CSS y JS sin frameworks), servido por nginx
│   ├── index.html         Sitio: menú, sucursales, opiniones…
│   ├── js/                main.js (sitio) · store.js (cuenta, favoritos, carrito, ticket) · cms.js (edición en vivo)
│   │                      product-modal.js (ventana de producto) · api.js (cliente del API)
│   ├── css/               styles.css (sitio) · store.css (tienda) · product-modal.css
│   ├── admin/             Panel de operación: pedidos en vivo, inventario, contenido y usuarios
│   ├── img/               Fotos reales de pasteleriasmiky.com optimizadas a WEBP
│   └── nginx.conf         Sirve el front y pasa /api al back
├── back/                  API en Node.js 22 + Express 5 + PostgreSQL
│   └── src/               server.js · auth.js · orders.js · routes/ (public, account, staff, admin)
├── db/
│   ├── init/              01_esquema.sql · 02_catalogo.sql · 03_inventario_demo.sql (se cargan la 1ª vez)
│   └── catalogo/          catalogo.json (41 productos reales, 91 presentaciones, 9 sucursales) + generar_seed.py
├── docker-compose.yml
└── .env.example
```

## Arrancar

```bash
cp .env.example .env        # cambia las contraseñas
docker compose up -d --build
```

- Sitio: <http://localhost:8090>
- Panel: <http://localhost:8090/admin/> — entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`
  (el primer admin se crea solo al arrancar si no existe ninguno).

`WEB_BIND=127.0.0.1` deja el sitio sólo en esta computadora; `0.0.0.0` lo abre a la red.

## Qué hace

**Clientes**
- Crean cuenta e inician sesión (contraseña con **scrypt** + sal; nunca se guarda en claro). Sesión en cookie `httpOnly`.
- Perfil con sus datos, cambio de contraseña, **favoritos** (♡ en la ventana del producto) y **mis pedidos**.
- **Carrito**: funciona sin sesión (se guarda en el navegador) y se une a la cuenta al iniciar sesión.
- **Ticket**: elige la sucursal donde recoge (se muestra si hay existencias), día opcional y notas.
  Al generar el ticket se **apartan** las existencias de esa sucursal; si lo cancela, regresan.
  Se paga al recoger. El ticket se puede imprimir o guardar en PDF.

**Personal** (panel `/admin/`) — cada pedido nuevo llega **en vivo** (sonido, aviso y notificación del navegador).

| Rol | Pedidos | Inventario | Ventas | Contenido del sitio | Usuarios |
|---|---|---|---|---|---|
| Ventas | confirmar, entregar (cobra), cancelar | consulta | registro + venta en mostrador | — | — |
| Producción | en producción → listo | consulta | — | — | — |
| Supervisor | todo lo anterior | **sube / baja** existencias | todo + **anular** | **edita textos e imágenes**, fotos de productos | — |
| Admin | todo | sube / baja | todo + anular | edita | **alta, rol, sucursal, desactivar, contraseña** |

**Ventas (registro con IVA 16 %)**: los precios del catálogo ya incluyen IVA; cada venta guarda el desglose
(subtotal = total ÷ 1.16, IVA = total − subtotal). Una venta se registra cuando un pedido en línea se marca
**Entregado** (ahí se elige cómo pagó: efectivo, tarjeta o transferencia) o cuando el personal captura una
**venta en mostrador** (descuenta inventario). El módulo muestra totales, IVA, ticket promedio, desglose por
sucursal, método de pago, canal y productos más vendidos, con filtro por sucursal y fechas y **exportación CSV**
para contabilidad. Supervisor y admin pueden **anular** una venta (con motivo y, opcionalmente, regresando las piezas).

Al personal con **sucursal asignada** sólo le aparecen pedidos e inventario de esa sucursal. El back valida
todos los permisos en cada petición (el panel sólo oculta lo que no aplica).

**Editar el sitio**: un supervisor o admin abre *Mi cuenta → Editar textos e imágenes del sitio* (o
`/?editar=1`), toca cualquier texto marcado para cambiarlo y usa *Cambiar imagen* en las fotos. Sólo se
guardan los cambios; *Panel → Contenido → Restaurar original* los deshace.

## Datos

- `db/catalogo/catalogo.json` es la fuente del catálogo real (nombres, descripciones, precios, fotos, sucursales).
  Si lo editas: `python3 db/catalogo/generar_seed.py` regenera `db/init/02_catalogo.sql`.
- **`db/init/03_inventario_demo.sql` son existencias de demostración, no reales.** Antes de producción
  bórralo (o vacía la tabla `inventory`) y captura las existencias reales desde el panel.
- Cambios de esquema nuevos van en `db/migraciones/NNN_nombre.sql`: el back los aplica solo al arrancar,
  sin borrar datos (lleva el control en la tabla `schema_migrations`).
- Los SQL de `db/init` sólo corren cuando el volumen de la BD está vacío. Para empezar de cero:
  `docker compose down -v && docker compose up -d` (**borra todos los datos**).
- Respaldo de la BD: `docker compose exec db pg_dump -U miky miky > respaldo.sql`

## Antes de publicar

- Servir con HTTPS y poner `COOKIE_SECURE=true`.
- Contraseñas fuertes en `.env` (no se sube a git).
- Cambiar las **opiniones de ejemplo** y las **fotos de relleno** (`img/persona-*.webp`, de pravatar.cc)
  por reseñas y fotos reales de clientes con su permiso (lista `REVIEWS` en `front/js/main.js`).
- Número de WhatsApp en `WHATSAPP` (`front/js/main.js`).
- Confirmar el teléfono de V. Carranza (33 1845 9691, lada de Guadalajara).

## API (resumen)

| Método y ruta | Quién | Para qué |
|---|---|---|
| `GET /api/catalog` · `/api/branches` · `/api/branches/:id/stock` · `/api/content` | público | catálogo, sucursales, existencias, contenido editado |
| `POST /api/auth/register` · `login` · `logout` · `GET /api/auth/me` | público | cuenta |
| `PATCH /api/me` · `POST /api/me/password` | cliente | perfil |
| `GET/PUT/DELETE /api/me/favorites/:id` | cliente | favoritos |
| `GET /api/me/cart` · `PUT /api/me/cart/:variantId` · `POST /api/me/cart/merge` | cliente | carrito |
| `POST /api/orders` · `GET /api/me/orders` · `GET /api/orders/:folio` · `POST …/cancel` | cliente | ticket |
| `GET /api/staff/orders` · `PATCH …/:id/status` · `GET /api/staff/stream` (SSE) | personal | pedidos en vivo |
| `GET /api/staff/inventory` · `POST …/adjust` · `GET …/movements` | personal / supervisor+ | inventario |
| `PUT/DELETE /api/admin/content/:key` · `POST …/:key/image` · `POST /api/staff/products/:id/image` | supervisor+ | contenido |
| `GET /api/staff/sales` · `…/summary` · `…/export.csv` · `POST /api/staff/sales` | ventas, supervisor, admin | registro de ventas |
| `POST /api/staff/sales/:id/annul` | supervisor, admin | anular venta |
| `GET/POST/PATCH /api/admin/users` · `POST …/:id/password` | admin | usuarios |

Toda petición que modifica datos debe llevar el encabezado `X-Requested-With: miky` (protección CSRF).
