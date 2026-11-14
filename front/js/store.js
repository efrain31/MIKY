/* Tienda: cuenta (inicio de sesión, perfil, favoritos), carrito y ticket para recoger en sucursal.
   Sin sesión el carrito vive en este navegador; al iniciar sesión se une al de la cuenta. */
import { api, session, money, esc, toast } from './api.js';

const LOCAL_CART = 'miky_cart';
const LAST_BRANCH = 'miky_branch';
const STATUS = {
  nuevo: 'Recibido', confirmado: 'Confirmado', en_produccion: 'En preparación',
  listo: 'Listo para recoger', entregado: 'Entregado', cancelado: 'Cancelado',
};
const ROLE = { cliente: 'Cliente', ventas: 'Ventas', produccion: 'Producción', supervisor: 'Supervisor', admin: 'Administrador' };

let products = [], branches = [];
const byVariant = new Map();      // variantId → { product, size }
let favorites = new Set();        // ids numéricos de producto
let cart = [];                    // [{ variantId, quantity }]
let drawer, body, title;
let afterLogin = null;            // acción pendiente (p. ej. volver al carrito)

const ls = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* modo privado */ } },
};

/* =================== arranque =================== */
export async function initStore(data) {
  products = data.products;
  branches = data.branches;
  products.forEach((p) => p.sizes.forEach((s) => byVariant.set(s.id, { product: p, size: s })));
  buildDrawer();
  bindHeader();

  ProductModal.configure({
    onAdd: (p, size, qty) => addToCart(size.id, qty, p.name, size.label),
    isFavorite: (p) => favorites.has(p.pid),
    onToggleFavorite: (p) => toggleFavorite(p.pid),
  });

  try { session.set(await api.me()); } catch { session.set(null); }
  await onSession();
  session.onChange(paintHeader);
}

async function onSession() {
  if (session.user) {
    const local = ls.get(LOCAL_CART, []);
    const [favs, srv] = await Promise.all([
      api.favorites().catch(() => []),
      local.length ? api.mergeCart(local) : api.cart(),
    ]).catch(() => [[], { items: [] }]);
    if (local.length) ls.del(LOCAL_CART);
    favorites = new Set(favs.map((f) => f.id));
    cart = srv.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  } else {
    favorites = new Set();
    cart = ls.get(LOCAL_CART, []).filter((i) => byVariant.has(i.variantId));
  }
  paintHeader();
  ProductModal.refresh();
}

/* =================== encabezado =================== */
function bindHeader() {
  document.querySelectorAll('[data-open="account"]').forEach((b) => b.addEventListener('click', () => openDrawer(session.user ? 'account' : 'login')));
  document.querySelectorAll('[data-open="cart"]').forEach((b) => b.addEventListener('click', () => openDrawer('cart')));
}

function paintHeader() {
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  document.querySelectorAll('.cart-count').forEach((el) => {
    el.textContent = count;
    el.hidden = count === 0;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  });
  const u = session.user;
  document.querySelectorAll('.account-label').forEach((el) => { el.textContent = u ? u.name.split(' ')[0] : 'Entrar'; });
  document.querySelectorAll('[data-open="account"]').forEach((b) => b.classList.toggle('is-logged', Boolean(u)));
}

/* =================== cajón lateral =================== */
function buildDrawer() {
  drawer = document.createElement('dialog');
  drawer.className = 'drawer';
  drawer.setAttribute('aria-labelledby', 'drawerTitle');
  drawer.innerHTML = `
    <div class="drawer-panel">
      <header class="drawer-head">
        <h2 id="drawerTitle"></h2>
        <button type="button" class="drawer-close" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="drawer-body"></div>
    </div>`;
  document.body.appendChild(drawer);
  body = drawer.querySelector('.drawer-body');
  title = drawer.querySelector('#drawerTitle');
  drawer.querySelector('.drawer-close').addEventListener('click', closeDrawer);
  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeDrawer(); });
  drawer.addEventListener('cancel', (e) => { e.preventDefault(); closeDrawer(); });
}

function openDrawer(view, arg) {
  if (!drawer.open) {
    document.documentElement.classList.add('pm-lock');
    drawer.classList.remove('closing');
    drawer.showModal();
  }
  VIEWS[view](arg);
  body.scrollTop = 0;
}

function closeDrawer() {
  if (!drawer.open) return;
  drawer.classList.add('closing');
  setTimeout(() => {
    drawer.close();
    drawer.classList.remove('closing');
    if (!document.querySelector('dialog.pm[open]')) document.documentElement.classList.remove('pm-lock');
  }, 240);
}

const field = (label, input, hint = '') => `<label class="f"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
const formError = (form, msg) => {
  let el = form.querySelector('.f-error');
  if (!el) { el = document.createElement('p'); el.className = 'f-error'; el.setAttribute('role', 'alert'); form.prepend(el); }
  el.textContent = msg;
};
async function submitting(form, fn) {
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  form.querySelector('.f-error')?.remove();
  try { await fn(); } catch (err) { formError(form, err.message); } finally { btn.disabled = false; }
}

/* =================== vistas =================== */
const VIEWS = {
  login(note) {
    title.textContent = 'Inicia sesión';
    body.innerHTML = `
      ${note ? `<p class="d-note">${esc(note)}</p>` : ''}
      <form class="d-form" novalidate>
        ${field('Correo', '<input type="email" name="email" autocomplete="email" required>')}
        ${field('Contraseña', '<input type="password" name="password" autocomplete="current-password" required>')}
        <button class="btn btn-solid" type="submit">Entrar</button>
      </form>
      <p class="d-switch">¿Primera vez? <button type="button" class="link" data-go="register">Crea tu cuenta</button></p>`;
    const form = body.querySelector('form');
    form.email.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitting(form, async () => {
        session.set(await api.login(form.email.value, form.password.value));
        await loggedIn();
      });
    });
    body.querySelector('[data-go]').addEventListener('click', () => VIEWS.register(note));
  },

  register(note) {
    title.textContent = 'Crea tu cuenta';
    body.innerHTML = `
      ${note ? `<p class="d-note">${esc(note)}</p>` : ''}
      <form class="d-form" novalidate>
        ${field('Nombre', '<input name="name" autocomplete="name" required maxlength="80">')}
        ${field('Correo', '<input type="email" name="email" autocomplete="email" required>')}
        ${field('Teléfono', '<input type="tel" name="phone" autocomplete="tel" maxlength="25">', 'Para avisarte cuando tu pedido esté listo.')}
        ${field('Contraseña', '<input type="password" name="password" autocomplete="new-password" required minlength="8">', 'Mínimo 8 caracteres, con letras y al menos un número.')}
        <button class="btn btn-solid" type="submit">Crear cuenta</button>
      </form>
      <p class="d-switch">¿Ya tienes cuenta? <button type="button" class="link" data-go="login">Inicia sesión</button></p>`;
    const form = body.querySelector('form');
    form.name.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitting(form, async () => {
        session.set(await api.register({ name: form.name.value, email: form.email.value, phone: form.phone.value, password: form.password.value }));
        toast('¡Bienvenido a Miky! 🎂');
        await loggedIn();
      });
    });
    body.querySelector('[data-go]').addEventListener('click', () => VIEWS.login(note));
  },

  async account(tab = 'orders') {
    const u = session.user;
    title.textContent = `Hola, ${u.name.split(' ')[0]}`;
    body.innerHTML = `
      <div class="acc-card">
        <span class="acc-avatar">${esc(u.name[0].toUpperCase())}</span>
        <div><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></div>
        ${u.role !== 'cliente' ? `<span class="acc-role">${ROLE[u.role]}${u.branch ? ' · ' + esc(u.branch.name) : ''}</span>` : ''}
      </div>
      ${u.isStaff ? `<a class="btn btn-solid acc-panel" href="/admin/">Abrir panel de operación</a>` : ''}
      ${u.canEditSite ? `<button type="button" class="btn btn-outline acc-edit">${document.body.classList.contains('cms-editing') ? 'Terminar edición del sitio' : 'Editar textos e imágenes del sitio'}</button>` : ''}
      <div class="acc-tabs" role="tablist">
        <button role="tab" data-tab="orders">Mis pedidos</button>
        <button role="tab" data-tab="favs">Favoritos</button>
        <button role="tab" data-tab="me">Mis datos</button>
      </div>
      <div class="acc-pane"></div>
      <button type="button" class="link acc-logout">Cerrar sesión</button>`;
    body.querySelector('.acc-edit')?.addEventListener('click', () => {
      closeDrawer();
      window.dispatchEvent(new CustomEvent('cms:toggle'));
    });
    body.querySelector('.acc-logout').addEventListener('click', async () => {
      await api.logout().catch(() => {});
      session.set(null);
      await onSession();
      window.dispatchEvent(new CustomEvent('cms:off'));
      closeDrawer();
      toast('Cerraste sesión.');
    });
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    showTab(tab);
  },

  async cart() {
    title.textContent = 'Tu pedido';
    const items = cart.map((c) => ({ ...c, ...byVariant.get(c.variantId) })).filter((i) => i.product);
    if (!items.length) {
      body.innerHTML = `
        <div class="d-empty">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9zM9 8V6.5a3 3 0 0 1 6 0V8"/></svg>
          <p>Tu pedido está vacío.</p>
          <a class="btn btn-solid" href="#menu">Ver el menú</a>
        </div>`;
      body.querySelector('a').addEventListener('click', closeDrawer);
      return;
    }
    const total = items.reduce((s, i) => s + i.size.price * i.quantity, 0);
    const lastBranch = ls.get(LAST_BRANCH, '');
    const states = [...new Set(branches.map((b) => b.state))];
    body.innerHTML = `
      <ul class="cart-list">${items.map((i) => `
        <li class="cart-item" data-v="${i.variantId}">
          <span class="ci-img" style="--c:${i.product.color}"><img src="${i.size.image || i.product.image}" alt=""></span>
          <div class="ci-info">
            <strong>${esc(i.product.name)}</strong>
            <small>${esc(i.size.label)}${i.size.serves ? ' · ' + esc(i.size.serves) : ''}</small>
            <span class="ci-stock" aria-live="polite"></span>
          </div>
          <div class="ci-qty">
            <button type="button" data-d="-1" aria-label="Menos">−</button>
            <output>${i.quantity}</output>
            <button type="button" data-d="1" aria-label="Más">+</button>
          </div>
          <span class="ci-price">${money(i.size.price * i.quantity)}</span>
        </li>`).join('')}
      </ul>
      <form class="d-form checkout" novalidate>
        ${field('¿En qué sucursal lo recoges?', `<select name="branch" required>
            <option value="">Elige una sucursal</option>
            ${states.map((st) => `<optgroup label="${esc(st)}">${branches.filter((b) => b.state === st).map((b) =>
              `<option value="${b.id}" ${String(b.id) === String(lastBranch) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</optgroup>`).join('')}
          </select>`, 'Te mostramos si hay existencias en esa sucursal.')}
        <div class="checkout-total"><span>Total</span><strong>${money(total)}</strong></div>
        <p class="d-note small">No se cobra en línea. Te damos un folio para recoger y pagar tu pedido en la sucursal.</p>
        <button class="btn btn-solid" type="submit">Generar ticket de pedido</button>
      </form>`;

    body.querySelectorAll('.ci-qty button').forEach((b) => b.addEventListener('click', async () => {
      const li = b.closest('.cart-item');
      const v = Number(li.dataset.v);
      const cur = cart.find((c) => c.variantId === v)?.quantity || 0;
      await setQuantity(v, cur + Number(b.dataset.d));
      VIEWS.cart();
    }));

    const form = body.querySelector('.checkout');
    const check = async () => {
      const id = form.branch.value;
      body.querySelectorAll('.ci-stock').forEach((s) => { s.textContent = ''; s.className = 'ci-stock'; });
      form.querySelector('[type="submit"]').disabled = false;
      if (!id) return true;
      ls.set(LAST_BRANCH, id);
      const stock = await api.stock(id).catch(() => null);
      if (!stock) return true;
      let ok = true;
      items.forEach((i) => {
        const have = stock[i.variantId] ?? 0;
        const el = body.querySelector(`.cart-item[data-v="${i.variantId}"] .ci-stock`);
        if (have >= i.quantity) { el.textContent = 'Disponible'; el.classList.add('ok'); }
        else { ok = false; el.textContent = have ? `Sólo hay ${have} en esta sucursal` : 'Agotado en esta sucursal'; el.classList.add('no'); }
      });
      form.querySelector('[type="submit"]').disabled = !ok;
      return ok;
    };
    form.branch.addEventListener('change', check);
    if (form.branch.value) check();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.branch.value) return formError(form, 'Elige la sucursal donde vas a recoger.');
      if (!session.user) {
        afterLogin = () => openDrawer('cart');
        return VIEWS.login('Inicia sesión o crea tu cuenta para generar tu ticket. Tu pedido se guarda.');
      }
      submitting(form, async () => {
        try {
          const order = await api.createOrder({ branchId: Number(form.branch.value) });
          cart = [];
          paintHeader();
          VIEWS.ticket(order);
          toast(`Ticket ${order.folio} generado. ¡Te esperamos!`);
        } catch (err) {
          if (err.status === 409) check();
          throw err;
        }
      });
    });
  },

  ticket(order) {
    title.textContent = 'Tu ticket';
    const b = order.branch;
    body.innerHTML = `
      <article class="ticket">
        <img class="ticket-logo" src="/img/logo.webp" alt="Miky" width="110" height="61">
        <p class="ticket-label">Folio</p>
        <p class="ticket-folio">${esc(order.folio)}</p>
        <span class="status s-${order.status}">${STATUS[order.status]}</span>
        <dl class="ticket-data">
          <div><dt>Recoge en</dt><dd><strong>${esc(b.name)}</strong><br>${esc(b.address)}<br>${(b.phones || []).map((t) => `<a href="tel:+52${t.replace(/\s/g, '')}">${esc(t)}</a>`).join(' · ')}</dd></div>
          ${order.pickupDate ? `<div><dt>Día</dt><dd>${new Date(order.pickupDate + 'T12:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</dd></div>` : ''}
          <div><dt>Generado</dt><dd>${new Date(order.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
          ${order.notes ? `<div><dt>Notas</dt><dd>${esc(order.notes)}</dd></div>` : ''}
        </dl>
        <ul class="ticket-items">${order.items.map((i) => `
          <li><span>${i.quantity} × ${esc(i.product)} <small>${esc(i.size)}</small></span><span>${money(i.price * i.quantity)}</span></li>`).join('')}
        </ul>
        <div class="ticket-total"><span>Total a pagar en sucursal</span><strong>${money(order.total)}</strong></div>
        ${order.status === 'cancelado' ? '' : `<p class="ticket-howto">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>
          <span>Presenta el folio <b>${esc(order.folio)}</b> en <b>${esc(b.name)}</b> para <b>recoger y pagar</b> tu pedido.</span>
        </p>`}
      </article>
      <div class="ticket-actions">
        <button type="button" class="btn btn-solid t-print">Imprimir o guardar PDF</button>
        <button type="button" class="btn btn-outline t-orders">Ver mis pedidos</button>
        ${order.status === 'nuevo' ? '<button type="button" class="link t-cancel">Cancelar pedido</button>' : ''}
      </div>`;
    body.querySelector('.t-print').addEventListener('click', () => {
      document.body.classList.add('printing-ticket');
      window.print();
      setTimeout(() => document.body.classList.remove('printing-ticket'), 500);
    });
    body.querySelector('.t-orders').addEventListener('click', () => VIEWS.account('orders'));
    body.querySelector('.t-cancel')?.addEventListener('click', () => {
      const box = body.querySelector('.ticket-actions');
      box.innerHTML = `
        <div class="t-confirm" role="alertdialog" aria-labelledby="tcTitle">
          <p id="tcTitle"><b>¿Cancelar el pedido ${esc(order.folio)}?</b><br>Tus productos se liberan para otros clientes y ya no podrás recogerlo.</p>
          <button type="button" class="btn btn-danger t-yes">Sí, cancelar pedido</button>
          <button type="button" class="btn btn-outline t-no">No, conservarlo</button>
        </div>`;
      box.querySelector('.t-no').addEventListener('click', () => VIEWS.ticket(order));
      box.querySelector('.t-yes').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try { VIEWS.ticket(await api.cancelOrder(order.folio)); toast('Pedido cancelado.'); }
        catch (err) { toast(err.message, 'error'); VIEWS.ticket(order); }
      });
      box.querySelector('.t-no').focus();
    });
  },
};

async function showTab(tab) {
  body.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const pane = body.querySelector('.acc-pane');
  pane.innerHTML = '<p class="d-loading">Cargando…</p>';
  try {
    if (tab === 'orders') {
      const orders = await api.myOrders();
      pane.innerHTML = orders.length ? `<ul class="orders">${orders.map((o) => `
        <li><button type="button" data-folio="${esc(o.folio)}">
          <span><strong>${esc(o.folio)}</strong><small>${new Date(o.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · ${esc(o.branch.name)}</small></span>
          <span class="status s-${o.status}">${STATUS[o.status]}</span>
          <span class="o-total">${money(o.total)}</span>
        </button></li>`).join('')}</ul>` : '<p class="d-empty-sm">Todavía no tienes pedidos.</p>';
      pane.querySelectorAll('[data-folio]').forEach((b) => b.addEventListener('click', async () => VIEWS.ticket(await api.order(b.dataset.folio))));
    } else if (tab === 'favs') {
      const favs = await api.favorites();
      pane.innerHTML = favs.length ? `<ul class="favs">${favs.map((f) => `
        <li><button type="button" data-slug="${esc(f.slug)}" style="--c:${f.color}">
          <img src="${f.image}" alt=""><strong>${esc(f.name)}</strong><small>desde ${money(f.from)}</small>
        </button></li>`).join('')}</ul>` : '<p class="d-empty-sm">Toca el ♡ en un producto para guardarlo aquí.</p>';
      pane.querySelectorAll('[data-slug]').forEach((b) => b.addEventListener('click', () => { closeDrawer(); setTimeout(() => ProductModal.open(b.dataset.slug), 260); }));
    } else {
      const u = session.user;
      pane.innerHTML = `
        <form class="d-form f-profile" novalidate>
          ${field('Nombre', `<input name="name" value="${esc(u.name)}" required maxlength="80">`)}
          ${field('Teléfono', `<input type="tel" name="phone" value="${esc(u.phone || '')}" maxlength="25">`)}
          <button class="btn btn-solid" type="submit">Guardar</button>
        </form>
        <form class="d-form f-pass" novalidate>
          <h3>Cambiar contraseña</h3>
          ${field('Contraseña actual', '<input type="password" name="current" autocomplete="current-password" required>')}
          ${field('Nueva contraseña', '<input type="password" name="next" autocomplete="new-password" required minlength="8">', 'Mínimo 8 caracteres, con letras y al menos un número.')}
          <button class="btn btn-outline" type="submit">Cambiar contraseña</button>
        </form>`;
      const f1 = pane.querySelector('.f-profile'), f2 = pane.querySelector('.f-pass');
      f1.addEventListener('submit', (e) => { e.preventDefault(); submitting(f1, async () => { session.set({ ...session.user, ...(await api.updateMe({ name: f1.name.value, phone: f1.phone.value })) }); toast('Datos guardados.'); }); });
      f2.addEventListener('submit', (e) => { e.preventDefault(); submitting(f2, async () => { await api.changePassword(f2.current.value, f2.next.value); f2.reset(); toast('Contraseña actualizada.'); }); });
    }
  } catch (err) {
    pane.innerHTML = `<p class="f-error">${esc(err.message)}</p>`;
  }
}

async function loggedIn() {
  await onSession();
  toast(`Hola, ${session.user.name.split(' ')[0]} 👋`);
  if (afterLogin) { const fn = afterLogin; afterLogin = null; fn(); }
  else VIEWS.account();
}

/* =================== carrito =================== */
async function setQuantity(variantId, qty) {
  qty = Math.max(0, Math.min(50, qty));
  if (session.user) {
    const res = await api.setCartItem(variantId, qty);
    cart = res.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  } else {
    cart = cart.filter((c) => c.variantId !== variantId);
    if (qty) cart.push({ variantId, quantity: qty });
    ls.set(LOCAL_CART, cart);
  }
  paintHeader();
}

async function addToCart(variantId, qty, name, label) {
  const cur = cart.find((c) => c.variantId === variantId)?.quantity || 0;
  try {
    await setQuantity(variantId, cur + qty);
    toast(`Agregado: ${qty} × ${name} (${label})`);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* =================== favoritos =================== */
async function toggleFavorite(productId) {
  if (!session.user) {
    afterLogin = () => { closeDrawer(); toast('Ya puedes guardar tus favoritos ♡'); };
    openDrawer('login', 'Inicia sesión para guardar tus pasteles favoritos.');
    return undefined;
  }
  const on = !favorites.has(productId);
  try {
    if (on) { await api.addFavorite(productId); favorites.add(productId); toast('Guardado en tus favoritos ♡'); }
    else { await api.removeFavorite(productId); favorites.delete(productId); }
    return on;
  } catch (err) {
    toast(err.message, 'error');
    return !on;
  }
}
