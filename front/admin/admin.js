/* Panel de operación: pedidos en vivo, inventario por sucursal, contenido del sitio y usuarios.
   Lo que ve cada quien depende de su rol (el back también lo valida en cada petición). */
import { api, money, esc, toast } from '/js/api.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ROLE = { cliente: 'Cliente', ventas: 'Ventas', produccion: 'Producción', supervisor: 'Supervisor', admin: 'Administrador' };
const ACTION = {
  confirmado: 'Confirmar', en_produccion: 'A producción', listo: 'Marcar listo', entregado: 'Entregado', cancelado: 'Cancelar',
};
const ACTIVE_COLS = ['nuevo', 'confirmado', 'en_produccion', 'listo'];
const HISTORY_COLS = ['entregado', 'cancelado'];

let catalogCache;
let me, meta, branches = [], orders = [], scope = 'active', invBranch = null, invRows = [];

/* =================== sesión =================== */
async function boot() {
  try { me = await api.me(); } catch { me = null; }
  if (!me || !me.isStaff) return showLogin(me ? 'Esta cuenta no tiene acceso al panel. Pide a un administrador que te asigne un rol.' : '');
  meta = await api.staffMeta();
  branches = await api.staffBranches();
  startApp();
}

function showLogin(msg) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const form = $('.login-card');
  form.querySelector('.f-error')?.remove();
  if (msg) form.insertAdjacentHTML('afterbegin', `<p class="f-error">${esc(msg)}</p>`);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    form.querySelector('.f-error')?.remove();
    try {
      await api.login(form.email.value, form.password.value);
      await boot();
    } catch (err) {
      form.insertAdjacentHTML('afterbegin', `<p class="f-error">${esc(err.message)}</p>`);
    } finally { btn.disabled = false; }
  };
  form.email.focus();
}

function startApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('.me-name').textContent = me.name;
  $('.me-role').textContent = `${ROLE[me.role]}${me.branch ? ' · ' + me.branch.name : ' · todas las sucursales'}`;
  $$('[data-need]').forEach((b) => { b.hidden = !meta[b.dataset.need]; });
  $('.main').insertAdjacentHTML('afterbegin', `<div class="mobile-user"><span>${esc(me.name)} · ${ROLE[me.role]}</span><button type="button" class="link logout">Cerrar sesión</button></div>`);
  $$('.logout').forEach((b) => b.addEventListener('click', async () => { await api.logout().catch(() => {}); location.reload(); }));

  // filtros de sucursal (si no tiene una asignada)
  const opts = branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  $('.branch-filter').innerHTML = me.branch ? opts : `<option value="">Todas las sucursales</option>${opts}`;
  $('.branch-filter').hidden = Boolean(me.branch);
  $('.inv-branch').innerHTML = opts;
  $('.inv-branch').hidden = Boolean(me.branch);
  invBranch = branches[0]?.id;

  $$('.side-nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $('.branch-filter').addEventListener('change', loadOrders);
  $$('.seg [data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope;
    $$('.seg [data-scope]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    loadOrders();
  }));
  setupNotifications();
  connectStream();
  go(location.hash.slice(1) || 'orders');
}

function go(view) {
  const btn = $(`.side-nav [data-view="${view}"]`);
  if (!btn || btn.hidden) view = 'orders';
  $$('.side-nav button').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  $$('.view').forEach((v) => { v.hidden = v.id !== `v-${view}`; });
  history.replaceState(null, '', `#${view}`);
  ({ orders: loadOrders, inventory: loadInventory, sales: loadSales, content: loadContent, users: loadUsers })[view]();
}

/* =================== pedidos =================== */
async function loadOrders() {
  const branch = $('.branch-filter').value;
  const qs = new URLSearchParams();
  if (branch) qs.set('branch', branch);
  if (scope === 'active') qs.set('active', '1'); else qs.set('status', HISTORY_COLS.join(','));
  try {
    orders = await api.staffOrders(`?${qs}`);
    renderBoard();
  } catch (err) { toast(err.message, 'error'); }
}

function renderBoard(freshId) {
  const cols = scope === 'active' ? ACTIVE_COLS : HISTORY_COLS;
  const board = $('#board');
  board.classList.toggle('history', scope !== 'active');
  board.innerHTML = cols.map((st) => {
    const list = orders.filter((o) => o.status === st);
    return `
      <section class="col">
        <header class="col-head"><span>${meta.statuses[st]}</span><b>${list.length}</b></header>
        <div class="col-list">${list.length ? list.map((o) => orderCard(o, o.id === freshId)).join('') : '<p class="col-empty">Sin pedidos</p>'}</div>
      </section>`;
  }).join('');
  board.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.id), b.dataset.next, b)));
  const pending = orders.filter((o) => o.status === 'nuevo').length;
  const badge = $('.nav-badge');
  badge.textContent = pending;
  badge.hidden = scope !== 'active' || pending === 0;
}

const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  return new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

function orderCard(o, fresh) {
  const pick = o.pickupDate ? new Date(o.pickupDate + 'T12:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) : null;
  return `
    <article class="order${fresh ? ' fresh' : ''}" data-order="${o.id}">
      <div class="o-top"><span class="o-folio">${esc(o.folio)}</span><span class="o-time" title="${new Date(o.createdAt).toLocaleString('es-MX')}">${ago(o.createdAt)}</span></div>
      <p class="o-who"><strong>${esc(o.customer.name)}</strong>${o.customer.phone ? ` · <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a>` : ''}</p>
      ${me.branch ? '' : `<span class="o-branch">${esc(o.branch.name)}</span>`}
      <ul class="o-items">${o.items.map((i) => `<li><span>${i.quantity} × ${esc(i.product)} <small>${esc(i.size)}</small></span></li>`).join('')}</ul>
      ${pick || o.notes ? `<div class="o-meta">${pick ? `<span class="o-pick">Recoge: ${pick}</span>` : ''}${o.notes ? `<span class="o-notes">${esc(o.notes)}</span>` : ''}</div>` : ''}
      <div class="o-foot">
        <span class="o-total">${money(o.total)}</span>
        <div class="o-actions">${(o.next || []).map((n) => `<button type="button" class="${n === 'cancelado' ? 'cancel' : ''}" data-id="${o.id}" data-next="${n}">${ACTION[n]}</button>`).join('')}</div>
      </div>
    </article>`;
}

async function move(id, next, btn) {
  const o = orders.find((x) => x.id === id);
  let note, paymentMethod;
  if (next === 'cancelado') {
    note = await cancelOrderDialog(o);          // motivo (o '' si no se escribió) · null si se arrepintió
    if (note === null) return;
  }
  if (next === 'entregado') {
    paymentMethod = await payDialog(o);          // al entregar se cobra: queda registrada la venta
    if (!paymentMethod) return;
  }
  btn.disabled = true;
  try {
    const upd = await api.setOrderStatus(id, next, note || undefined, paymentMethod);
    if (paymentMethod) toast(`Venta registrada: ${upd.folio} · ${money(upd.total)} · ${PAY[paymentMethod]}`);
    orders = orders.map((x) => (x.id === id ? upd : x));
    if (scope === 'active' && HISTORY_COLS.includes(upd.status)) orders = orders.filter((x) => x.id !== id);
    renderBoard();
    toast(`${upd.folio}: ${meta.statuses[upd.status]}`);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
  }
}

/* =================== alertas en vivo =================== */
function connectStream() {
  const es = new EventSource('/api/staff/stream');
  es.addEventListener('order.created', async (e) => {
    const { payload } = JSON.parse(e.data);
    chime();
    toast(`🔔 Nuevo pedido ${payload.folio} · ${payload.branch.name} · ${money(payload.total)}`, 'ok', 6000);
    notify(`Nuevo pedido ${payload.folio}`, `${payload.customer.name} · ${payload.branch.name} · ${money(payload.total)}`);
    if (!$('#v-orders').hidden && scope === 'active') {
      const branch = $('.branch-filter').value;
      if (!branch || Number(branch) === payload.branch.id) {
        const full = await api.staffOrder(payload.id).catch(() => null);
        if (full) { orders = [full, ...orders.filter((o) => o.id !== full.id)]; renderBoard(full.id); }
      }
    } else {
      const b = $('.nav-badge');
      b.textContent = Number(b.textContent || 0) + 1;
      b.hidden = false;
    }
  });
  es.addEventListener('order.updated', (e) => {
    const { payload } = JSON.parse(e.data);
    if ($('#v-orders').hidden || !orders.some((o) => o.id === payload.id)) return;
    api.staffOrder(payload.id).then((full) => {
      orders = orders.map((o) => (o.id === full.id ? full : o));
      if (scope === 'active' && HISTORY_COLS.includes(full.status)) orders = orders.filter((o) => o.id !== full.id);
      renderBoard();
    }).catch(() => {});
  });
  es.addEventListener('inventory.updated', (e) => {
    const { payload } = JSON.parse(e.data);
    if ($('#v-inventory').hidden || payload.branchId !== invBranch) return;
    setQty(payload.variantId, payload.quantity);
  });
}

let audioCtx;
function chime() {
  try {
    audioCtx ||= new AudioContext();
    const t = audioCtx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.45);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.5);
    });
  } catch { /* sin audio */ }
}

function setupNotifications() {
  const btn = $('.notify-btn');
  const paint = () => {
    const p = 'Notification' in window ? Notification.permission : 'denied';
    btn.hidden = p === 'granted' || p === 'denied';
  };
  paint();
  btn.addEventListener('click', async () => {
    audioCtx ||= new AudioContext();       // desbloquea el sonido con un toque del usuario
    if ('Notification' in window) await Notification.requestPermission();
    paint();
    toast('Avisos activados: sonará y verás una notificación con cada pedido nuevo.');
  });
}
function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  const n = new Notification(title, { body, icon: '/img/favicon.webp', tag: title });
  n.onclick = () => { window.focus(); go('orders'); n.close(); };
}

/* =================== inventario =================== */
async function loadInventory() {
  const sel = $('.inv-branch');
  if (!sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.addEventListener('change', () => { invBranch = Number(sel.value); loadInventory(); });
    $('.inv-search').addEventListener('input', renderInventory);
  }
  invBranch = Number(sel.value) || invBranch;
  $('.inv-sub').textContent = meta.canEditInventory
    ? 'Sube existencias al terminar producción y bájalas por merma. Los pedidos en línea las apartan solos.'
    : 'Consulta de existencias. Sólo un supervisor o admin puede modificarlas.';
  try {
    invRows = await api.inventory(invBranch);
    renderInventory();
    loadMoves();
  } catch (err) { toast(err.message, 'error'); }
}

const qClass = (n) => (n === 0 ? 'q q-0' : n <= 2 ? 'q q-low' : 'q');

function renderInventory() {
  const term = $('.inv-search').value.trim().toLowerCase();
  const rows = invRows.filter((r) => !term || r.product.toLowerCase().includes(term));
  const byCat = Map.groupBy(rows, (r) => r.category);
  $('#inv').innerHTML = [...byCat].map(([cat, list]) => `
    <section class="inv-cat">
      <h2>${esc(cat)}</h2>
      <div class="inv-grid">${[...Map.groupBy(list, (r) => r.productId)].map(([, vs]) => `
        <article class="inv-prod">
          <img src="${vs[0].image}" alt="" loading="lazy">
          <div>
            <h3>${esc(vs[0].product)}</h3>
            <div class="inv-rows">${vs.map((v) => `
              <div class="inv-row" data-v="${v.variantId}">
                <span class="sz">${esc(v.size)} <small>${money(v.price)}</small></span>
                <span class="${qClass(v.quantity)}" title="${v.updatedBy ? 'Último cambio: ' + esc(v.updatedBy) : ''}">${v.quantity}</span>
                ${meta.canEditInventory ? `<span class="adj">
                  <button type="button" data-d="-1" aria-label="Bajar 1">−</button>
                  <button type="button" data-d="1" aria-label="Subir 1">+</button>
                  <button type="button" class="more" data-d="custom" aria-label="Ajustar cantidad">Ajustar</button>
                </span>` : '<span></span>'}
              </div>`).join('')}
            </div>
          </div>
        </article>`).join('')}
      </div>
    </section>`).join('') || '<p class="col-empty">Sin resultados.</p>';

  $$('#inv .adj button').forEach((b) => b.addEventListener('click', async () => {
    const vid = Number(b.closest('.inv-row').dataset.v);
    let delta = Number(b.dataset.d), reason;
    if (b.dataset.d === 'custom') {
      const res = await adjustDialog(invRows.find((r) => r.variantId === vid));
      if (!res) return;
      ({ delta, reason } = res);
    }
    b.disabled = true;
    try {
      const r = await api.adjustInventory({ branchId: invBranch, variantId: vid, delta, reason });
      setQty(vid, r.quantity);
      loadMoves();
    } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
  }));
}

/** Ventana para registrar una entrada o salida de inventario. Regresa { delta, reason } o null. */
const REASONS = {
  in: ['Entrada de producción', 'Traspaso recibido', 'Devolución', 'Conteo físico'],
  out: ['Merma', 'Caducidad', 'Venta en mostrador', 'Traspaso enviado', 'Conteo físico'],
};
function adjustDialog(row) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'adj-dlg';
    dlg.setAttribute('aria-labelledby', 'adjTitle');
    dlg.innerHTML = `
      <form method="dialog" novalidate>
        <header class="adj-head">
          <img src="${row.image}" alt="" width="64" height="64">
          <div>
            <h2 id="adjTitle">${esc(row.product)}</h2>
            <p>${esc(row.size)} · ${esc(branches.find((b) => b.id === invBranch)?.name || '')}</p>
          </div>
          <button type="button" class="adj-x" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </header>

        <div class="adj-now">Hay <b class="${qClass(row.quantity)}">${row.quantity}</b> en existencia</div>

        <div class="adj-type" role="radiogroup" aria-label="Tipo de movimiento">
          <button type="button" role="radio" data-type="in" aria-checked="true">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span><b>Entrada</b><small>Producción, traspaso…</small></span>
          </button>
          <button type="button" role="radio" data-type="out" aria-checked="false">
            <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg><span><b>Salida</b><small>Merma, caducidad…</small></span>
          </button>
        </div>

        <label class="adj-label" for="adjQty">¿Cuántas piezas?</label>
        <div class="adj-stepper">
          <button type="button" data-step="-1" aria-label="Menos">−</button>
          <input id="adjQty" type="number" inputmode="numeric" min="1" max="500" value="1">
          <button type="button" data-step="1" aria-label="Más">+</button>
        </div>
        <div class="adj-chips adj-quick">${[1, 3, 6, 12].map((n) => `<button type="button" data-set="${n}">${n}</button>`).join('')}</div>

        <span class="adj-label">Motivo</span>
        <div class="adj-chips adj-reasons"></div>

        <div class="adj-preview" aria-live="polite"></div>
        <p class="adj-error" role="alert" hidden></p>

        <footer class="adj-foot">
          <button type="button" class="btn btn-outline adj-cancel">Cancelar</button>
          <button type="submit" class="btn btn-solid adj-ok">Registrar</button>
        </footer>
      </form>`;
    document.body.appendChild(dlg);

    let type = 'in', reason = REASONS.in[0];
    const qty = dlg.querySelector('#adjQty');
    const preview = dlg.querySelector('.adj-preview');
    const error = dlg.querySelector('.adj-error');
    const ok = dlg.querySelector('.adj-ok');

    const paintReasons = () => {
      if (!REASONS[type].includes(reason)) reason = REASONS[type][0];
      dlg.querySelector('.adj-reasons').innerHTML = REASONS[type].map((r) =>
        `<button type="button" data-reason="${esc(r)}" aria-pressed="${r === reason}">${esc(r)}</button>`).join('');
    };
    const paint = () => {
      const n = Math.trunc(Number(qty.value));
      const valid = Number.isInteger(n) && n >= 1 && n <= 500;
      const after = row.quantity + (type === 'in' ? n : -n);
      dlg.dataset.type = type;
      dlg.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.type === type)));
      dlg.querySelectorAll('[data-set]').forEach((b) => b.classList.toggle('on', Number(b.dataset.set) === n));
      if (!valid) {
        preview.innerHTML = '';
        error.textContent = 'Escribe una cantidad entre 1 y 500.';
      } else if (after < 0) {
        preview.innerHTML = '';
        error.textContent = `Sólo hay ${row.quantity}; no puedes sacar ${n}.`;
      } else {
        error.textContent = '';
        preview.innerHTML = `<span>${row.quantity}</span><span class="arrow">${type === 'in' ? '+' : '−'} ${n} →</span><b class="${qClass(after)}">${after}</b><small>quedarán</small>`;
      }
      error.hidden = !error.textContent;
      ok.disabled = Boolean(error.textContent);
      ok.textContent = valid ? `Registrar ${type === 'in' ? 'entrada' : 'salida'} de ${n}` : 'Registrar';
    };

    const finish = (value) => {
      dlg.classList.add('closing');
      setTimeout(() => { dlg.close(); dlg.remove(); resolve(value); }, 180);
    };

    dlg.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (e.target === dlg) return finish(null);
      if (!t) return;
      if (t.dataset.type) { type = t.dataset.type; paintReasons(); }
      if (t.dataset.step) qty.value = Math.max(1, Math.min(500, (Math.trunc(Number(qty.value)) || 0) + Number(t.dataset.step)));
      if (t.dataset.set) qty.value = t.dataset.set;
      if (t.dataset.reason) { reason = t.dataset.reason; paintReasons(); }
      if (t.classList.contains('adj-cancel') || t.classList.contains('adj-x')) return finish(null);
      paint();
    });
    qty.addEventListener('input', paint);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dlg.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (ok.disabled) return;
      const n = Math.trunc(Number(qty.value));
      finish({ delta: type === 'in' ? n : -n, reason });
    });

    paintReasons();
    paint();
    dlg.showModal();
    qty.select();
  });
}

function setQty(variantId, qty) {
  const row = invRows.find((r) => r.variantId === variantId);
  if (row) row.quantity = qty;
  const el = $(`#inv .inv-row[data-v="${variantId}"]`);
  if (!el) return;
  const q = el.children[1];
  q.className = qClass(qty);
  q.textContent = qty;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

async function loadMoves() {
  const list = await api.movements(invBranch).catch(() => []);
  $('#moves').innerHTML = list.slice(0, 25).map((m) => `
    <li>
      <span class="d ${m.delta > 0 ? 'up' : 'down'}">${m.delta > 0 ? '+' : ''}${m.delta}</span>
      <span>${esc(m.product)} · ${esc(m.size)}<br><small>${esc(m.reason)}${m.user_name ? ' · ' + esc(m.user_name) : ''}</small></span>
      <small>${ago(m.created_at)} · quedan ${m.quantity_after}</small>
    </li>`).join('') || '<li><small>Sin movimientos.</small></li>';
}

/* =================== ventas (IVA 16 % incluido en precios) =================== */
const PAY = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const PAY_ICON = {
  efectivo: '<path d="M3 7h18v10H3zM7 12h.01M17 12h.01"/><circle cx="12" cy="12" r="2.5"/>',
  tarjeta: '<path d="M3 6h18v12H3zM3 10h18M7 15h4"/>',
  transferencia: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
};
const CHANNEL = { en_linea: 'En línea', mostrador: 'Mostrador' };
const IVA = 0.16;
const splitIva = (total) => {
  const cents = Math.round(total * 100);
  const sub = Math.round(cents / (1 + IVA));
  return { subtotal: sub / 100, iva: (cents - sub) / 100 };
};
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let salesPeriod = 'today';

/** Ventana reutilizable del panel: body es HTML; submit(dlg) regresa el valor o lanza un Error con el mensaje. */
function modal({ title, subtitle = '', body, ok = 'Aceptar', okClass = 'btn-solid', wide = false, onOpen, submit }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `adj-dlg m-dlg${wide ? ' wide' : ''}`;
    dlg.innerHTML = `
      <form method="dialog" novalidate>
        <header class="m-head">
          <div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>
          <button type="button" class="adj-x" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </header>
        <div class="m-body">${body}</div>
        <p class="adj-error" role="alert" hidden></p>
        <footer class="adj-foot">
          <button type="button" class="btn btn-outline m-cancel">Cancelar</button>
          <button type="submit" class="btn ${okClass} m-ok">${ok}</button>
        </footer>
      </form>`;
    document.body.appendChild(dlg);
    const err = dlg.querySelector('.adj-error');
    const done = (v) => { dlg.classList.add('closing'); setTimeout(() => { dlg.close(); dlg.remove(); resolve(v); }, 180); };
    dlg.querySelector('.adj-x').onclick = () => done(null);
    dlg.querySelector('.m-cancel').onclick = () => done(null);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) done(null); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    dlg.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const okBtn = dlg.querySelector('.m-ok');
      okBtn.disabled = true;
      err.hidden = true;
      try { done(await submit(dlg)); }
      catch (ex) { err.textContent = ex.message || String(ex); err.hidden = false; okBtn.disabled = false; }
    });
    dlg.showModal();
    onOpen?.(dlg);
  });
}

const payPicker = (selected = 'efectivo') => `
  <div class="pay-pick" role="radiogroup" aria-label="Método de pago">${Object.entries(PAY).map(([k, v]) => `
    <button type="button" role="radio" data-pay="${k}" aria-checked="${k === selected}">
      <svg viewBox="0 0 24 24">${PAY_ICON[k]}</svg><span>${v}</span>
    </button>`).join('')}
  </div>`;
const bindPayPicker = (dlg) => dlg.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => {
  dlg.querySelectorAll('[data-pay]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
}));
const pickedPay = (dlg) => dlg.querySelector('[data-pay][aria-checked="true"]')?.dataset.pay;

const ivaBox = (total) => {
  const { subtotal, iva } = splitIva(total);
  return `<dl class="iva-box"><div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div><div><dt>IVA 16 %</dt><dd>${money(iva)}</dd></div><div class="t"><dt>Total</dt><dd>${money(total)}</dd></div></dl>`;
};

/** Al entregar un pedido se cobra: elegir método de pago (así queda registrada la venta). */
function payDialog(o) {
  return modal({
    title: `Entregar ${esc(o.folio)}`,
    subtitle: `${esc(o.customer.name)} · ${esc(o.branch.name)}`,
    body: `
      <ul class="m-items">${o.items.map((i) => `<li><span>${i.quantity} × ${esc(i.product)} <small>${esc(i.size)}</small></span><b>${money(i.price * i.quantity)}</b></li>`).join('')}</ul>
      ${ivaBox(o.total)}
      <span class="adj-label">¿Cómo pagó?</span>
      ${payPicker()}`,
    ok: `Cobrar ${money(o.total)} y entregar`,
    onOpen: (dlg) => bindPayPicker(dlg),
    submit: async (dlg) => pickedPay(dlg),
  });
}

function salesQuery() {
  const today = new Date();
  let from, to = iso(today);
  if (salesPeriod === 'today') from = to;
  else if (salesPeriod === '7d') from = iso(new Date(today.getTime() - 6 * 864e5));
  else if (salesPeriod === 'month') from = iso(new Date(today.getFullYear(), today.getMonth(), 1));
  else { from = $('.s-from').value; to = $('.s-to').value; }
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const b = $('.s-branch').value;
  if (b) qs.set('branch', b);
  return qs;
}

async function loadSales() {
  const sel = $('.s-branch');
  if (!sel.dataset.bound) {
    sel.dataset.bound = '1';
    const opts = branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
    sel.innerHTML = me.branch ? opts : `<option value="">Todas las sucursales</option>${opts}`;
    sel.hidden = Boolean(me.branch);
    sel.addEventListener('change', loadSales);
    $$('.s-period [data-p]').forEach((b) => b.addEventListener('click', () => {
      salesPeriod = b.dataset.p;
      $$('.s-period [data-p]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $('.s-range').hidden = salesPeriod !== 'range';
      if (salesPeriod === 'range' && !$('.s-from').value) {
        $('.s-to').value = iso(new Date());
        $('.s-from').value = iso(new Date(Date.now() - 29 * 864e5));
      }
      loadSales();
    }));
    $$('.s-from, .s-to').forEach((i) => i.addEventListener('change', loadSales));
    $('.s-new').addEventListener('click', newSale);
  }
  const qs = salesQuery();
  $('.s-csv').href = `/api/staff/sales/export.csv?${qs}`;
  try {
    const [sum, list] = await Promise.all([api.salesSummary(qs), api.sales(qs)]);
    renderSales(sum, list);
  } catch (err) { toast(err.message, 'error'); }
}

function renderSales(sum, list) {
  const t = sum.totals;
  $('#kpis').innerHTML = `
    <div class="kpi main"><small>Total vendido</small><b>${money(t.total)}</b><span>con IVA</span></div>
    <div class="kpi"><small>Subtotal</small><b>${money(t.subtotal)}</b><span>sin IVA</span></div>
    <div class="kpi iva"><small>IVA 16 %</small><b>${money(t.iva)}</b><span>trasladado</span></div>
    <div class="kpi"><small>Ventas</small><b>${t.count}</b><span>${sum.annulled.count ? `${sum.annulled.count} anulada${sum.annulled.count > 1 ? 's' : ''}` : 'sin anulaciones'}</span></div>
    <div class="kpi"><small>Ticket promedio</small><b>${money(t.average)}</b><span>por venta</span></div>`;

  const pct = (v) => (t.total ? Math.round((v / t.total) * 100) : 0);
  $('#sByBranch').innerHTML = sum.byBranch.length ? `
    <table class="mini"><thead><tr><th>Sucursal</th><th class="num">Ventas</th><th class="num">Subtotal</th><th class="num">IVA</th><th class="num">Total</th></tr></thead>
    <tbody>${sum.byBranch.map((b) => `<tr><td>${esc(b.name)}</td><td class="num">${b.count}</td><td class="num">${money(b.subtotal)}</td><td class="num">${money(b.iva)}</td><td class="num"><b>${money(b.total)}</b></td></tr>`).join('')}</tbody></table>`
    : '<p class="col-empty">Sin ventas en este periodo.</p>';
  const rows = (arr) => (arr.length
    ? `<ul class="mini-list">${arr.map((x) => `<li><span>${esc(x.label)} <small>${x.count}</small></span><b>${money(x.total)}</b><em>${pct(x.total)} %</em></li>`).join('')}</ul>`
    : '<p class="col-empty">—</p>');
  $('#sByPay').innerHTML = rows(sum.byPayment);
  $('#sByChannel').innerHTML = rows(sum.byChannel);
  $('#sTop').innerHTML = sum.top.map((x) => `<li><span>${esc(x.product)} <small>${esc(x.size)}</small></span><b>${x.quantity} pza</b></li>`).join('') || '<li class="col-empty">—</li>';

  const showBranch = !me.branch && !$('.s-branch').value;
  $('.sales').classList.toggle('no-branch', !showBranch);
  $('#salesList').innerHTML = list.map((s) => `
    <tr class="${s.cancelled ? 'is-annulled' : ''}">
      <td><b class="mono">${esc(s.folio)}</b>${s.customerName ? `<small>${esc(s.customerName)}</small>` : ''}</td>
      <td>${new Date(s.createdAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<small>${esc(s.user || '')}</small></td>
      <td class="col-branch">${esc(s.branch.name)}</td>
      <td><span class="chip ${s.channel}">${CHANNEL[s.channel]}</span></td>
      <td>${PAY[s.paymentMethod]}</td>
      <td class="num">${money(s.subtotal)}</td>
      <td class="num">${money(s.iva)}</td>
      <td class="num"><b>${money(s.total)}</b>${s.cancelled ? '<small class="annul">Anulada</small>' : ''}</td>
      <td><button type="button" class="link" data-sale="${s.id}">Ver</button></td>
    </tr>`).join('') || '<tr><td colspan="9" class="col-empty">Sin ventas en este periodo.</td></tr>';
  $$('#salesList [data-sale]').forEach((b) => b.addEventListener('click', () => saleDetail(Number(b.dataset.sale))));
}

async function saleDetail(id) {
  const s = await api.sale(id).catch((err) => { toast(err.message, 'error'); return null; });
  if (!s) return;
  const canAnnul = meta.canAnnulSales && !s.cancelled;
  const res = await modal({
    title: `Venta ${esc(s.folio)}`,
    subtitle: `${CHANNEL[s.channel]} · ${esc(s.branch.name)} · ${new Date(s.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`,
    body: `
      ${s.cancelled ? `<p class="m-annulled">Anulada por ${esc(s.cancelled.by || '—')}: ${esc(s.cancelled.reason)}</p>` : ''}
      <ul class="m-items">${s.items.map((i) => `<li><span>${i.quantity} × ${esc(i.product)} <small>${esc(i.size)} · ${money(i.price)} c/u</small></span><b>${money(i.price * i.quantity)}</b></li>`).join('')}</ul>
      ${ivaBox(s.total)}
      <p class="m-meta">Pago: <b>${PAY[s.paymentMethod]}</b>${s.customerName ? ` · Cliente: <b>${esc(s.customerName)}</b>` : ''}${s.user ? ` · Atendió: <b>${esc(s.user)}</b>` : ''}</p>
      ${canAnnul ? `
        <details class="m-annul"><summary>Anular esta venta</summary>
          <label class="f"><span>Motivo</span><input name="reason" maxlength="200" placeholder="Ej. error de captura, devolución…"></label>
          <label class="m-check"><input type="checkbox" name="restock" ${s.channel === 'mostrador' ? 'checked' : ''}> Regresar las piezas al inventario de la sucursal</label>
        </details>` : ''}`,
    ok: 'Cerrar',
    onOpen: (dlg) => {
      dlg.querySelector('.m-cancel').hidden = true;
      const det = dlg.querySelector('.m-annul');
      det?.addEventListener('toggle', () => {
        const ok = dlg.querySelector('.m-ok');
        ok.textContent = det.open ? 'Anular venta' : 'Cerrar';
        ok.classList.toggle('btn-danger', det.open);
        if (det.open) dlg.querySelector('[name=reason]').focus();
      });
    },
    submit: async (dlg) => {
      const det = dlg.querySelector('.m-annul');
      if (!det?.open) return null;
      const reason = dlg.querySelector('[name=reason]').value.trim();
      if (reason.length < 3) throw new Error('Escribe el motivo de la anulación.');
      return api.annulSale(id, reason, dlg.querySelector('[name=restock]').checked);
    },
  });
  if (res) { toast(`Venta ${res.folio} anulada.`); loadSales(); }
}

/** Venta en mostrador: elegir productos, cantidades y método de pago; se ve el desglose de IVA. */
async function newSale() {
  catalogCache ||= (await api.catalog()).products;
  const catalog = catalogCache;
  const initialBranch = me.branch?.id || Number($('.s-branch').value) || branches[0]?.id;
  let stock = {};
  const cart = new Map();     // variantId → cantidad
  const vById = new Map();
  catalog.forEach((p) => p.sizes.forEach((z) => vById.set(z.id, { p, z })));

  const sale = await modal({
    title: 'Venta en mostrador',
    subtitle: 'Se descuenta del inventario de la sucursal.',
    wide: true,
    body: `
      ${me.branch ? '' : `<label class="f pos-branch"><span>Sucursal</span><select name="branch">${branches.map((b) => `<option value="${b.id}" ${b.id === initialBranch ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>`}
      <div class="pos">
        <div class="pos-left">
          <input type="search" class="pos-search" placeholder="Buscar producto…" aria-label="Buscar producto">
          <ul class="pos-list"></ul>
        </div>
        <div class="pos-right">
          <span class="adj-label">Ticket</span>
          <ul class="pos-cart"></ul>
          <div class="pos-iva"></div>
          <span class="adj-label">Método de pago</span>
          ${payPicker()}
          <label class="f"><span>Cliente (opcional)</span><input name="customer" maxlength="80" placeholder="Nombre para el registro"></label>
        </div>
      </div>`,
    ok: 'Registrar venta',
    onOpen: async (dlg) => {
      bindPayPicker(dlg);
      const bSel = dlg.querySelector('[name=branch]');
      const curBranch = () => (bSel ? Number(bSel.value) : initialBranch);
      dlg.curBranch = curBranch;
      const paintList = () => {
        const term = dlg.querySelector('.pos-search').value.trim().toLowerCase();
        dlg.querySelector('.pos-list').innerHTML = catalog.filter((p) => !term || p.name.toLowerCase().includes(term)).slice(0, 40).map((p) => `
          <li><img src="${p.image}" alt=""><div><b>${esc(p.name)}</b><div class="pos-sizes">${p.sizes.map((z) => {
            const left = (stock[z.id] ?? 0) - (cart.get(z.id) || 0);
            return `<button type="button" data-v="${z.id}" ${left <= 0 ? 'disabled' : ''}>${esc(z.label)} <small>${money(z.price)} · quedan ${left}</small></button>`;
          }).join('')}</div></div></li>`).join('') || '<li class="col-empty">Sin resultados.</li>';
      };
      const paintCart = () => {
        const lines = [...cart].map(([v, q]) => ({ ...vById.get(v), v, q }));
        dlg.querySelector('.pos-cart').innerHTML = lines.map((l) => `
          <li><span>${esc(l.p.name)} <small>${esc(l.z.label)}</small></span>
            <span class="pos-qty"><button type="button" data-dec="${l.v}" aria-label="Menos">−</button><b>${l.q}</b><button type="button" data-inc="${l.v}" aria-label="Más" ${l.q >= (stock[l.v] ?? 0) ? 'disabled' : ''}>+</button></span>
            <b>${money(l.z.price * l.q)}</b></li>`).join('') || '<li class="col-empty">Toca una presentación para agregarla.</li>';
        const total = lines.reduce((s, l) => s + l.z.price * l.q, 0);
        dlg.querySelector('.pos-iva').innerHTML = ivaBox(total);
        dlg.querySelector('.m-ok').textContent = total ? `Registrar venta · ${money(total)}` : 'Registrar venta';
      };
      const loadStock = async () => {
        const inv = await api.inventory(curBranch()).catch(() => []);
        stock = Object.fromEntries(inv.map((r) => [r.variantId, r.quantity]));
        paintList(); paintCart();
      };
      dlg.querySelector('.pos').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const add = (v, d) => {
          const n = Math.min((cart.get(v) || 0) + d, stock[v] ?? 0);
          if (n <= 0) cart.delete(v); else cart.set(v, n);
          paintList(); paintCart();
        };
        if (b.dataset.v) add(Number(b.dataset.v), 1);
        if (b.dataset.inc) add(Number(b.dataset.inc), 1);
        if (b.dataset.dec) add(Number(b.dataset.dec), -1);
      });
      dlg.querySelector('.pos-search').addEventListener('input', paintList);
      bSel?.addEventListener('change', () => { cart.clear(); loadStock(); });
      await loadStock();
      dlg.querySelector('.pos-search').focus();
    },
    submit: async (dlg) => {
      if (!cart.size) throw new Error('Agrega al menos un producto.');
      return api.createSale({
        branchId: dlg.curBranch(),
        items: [...cart].map(([variantId, quantity]) => ({ variantId, quantity })),
        paymentMethod: pickedPay(dlg),
        customerName: dlg.querySelector('[name=customer]').value,
      });
    },
  });
  if (sale) {
    toast(`Venta ${sale.folio} registrada · ${money(sale.total)} (IVA ${money(sale.iva)})`);
    if (!$('#v-sales').hidden) loadSales();
  }
}

/* =================== contenido =================== */
async function loadContent() {
  const content = await api.content().catch(() => ({}));
  const entries = Object.entries(content);
  $('#edits').innerHTML = entries.length ? entries.map(([k, c]) => `
    <li>
      <span>${c.kind === 'image' ? `<img src="${esc(c.value)}" alt="">` : `<span class="val">${esc(c.value)}</span>`}<code>${esc(k)}</code></span>
      <button type="button" class="link" data-reset="${esc(k)}">Restaurar original</button>
    </li>`).join('') : '<li><small>Aún no hay cambios. Todo se ve como el diseño original.</small></li>';
  $$('#edits [data-reset]').forEach((b) => b.addEventListener('click', async () => {
    const key = b.dataset.reset;
    if (await restoreDialog(key, content[key])) { toast('Se restauró el contenido original.'); loadContent(); }
  }));

  catalogCache ||= (await api.catalog()).products;
  const search = $('.ph-search');
  const paint = () => {
    const t = search.value.trim().toLowerCase();
    $('#photos').innerHTML = catalogCache.filter((p) => !t || p.name.toLowerCase().includes(t)).map((p) => `
      <li data-id="${p.id}">
        <img src="${p.image}" alt="">
        <span>${esc(p.name)}<br><small style="color:var(--muted)">${esc(p.categoryName)}</small></span>
        <button type="button" class="btn btn-outline btn-sm">Cambiar foto</button>
      </li>`).join('');
    $$('#photos button').forEach((b) => b.addEventListener('click', () => {
      const li = b.closest('li');
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/webp,image/jpeg,image/avif' });
      input.onchange = async () => {
        if (!input.files[0]) return;
        b.disabled = true;
        try {
          const r = await api.productImage(li.dataset.id, input.files[0]);
          li.querySelector('img').src = r.image;
          catalogCache.find((p) => String(p.id) === li.dataset.id).image = r.image;
          toast('Foto del producto actualizada.');
        } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
      };
      input.click();
    }));
  };
  search.oninput = paint;
  paint();
}

/* =================== usuarios =================== */
async function loadUsers() {
  const form = $('.u-form');
  if (!form.dataset.bound) {
    form.dataset.bound = '1';
    form.role.innerHTML = ['ventas', 'produccion', 'supervisor', 'admin'].map((r) => `<option value="${r}">${ROLE[r]}</option>`).join('');
    form.branchId.innerHTML = `<option value="">Todas las sucursales</option>${branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}`;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      form.querySelector('.f-error')?.remove();
      try {
        await api.createUser({ name: form.name.value, email: form.email.value, role: form.role.value, branchId: form.branchId.value || null, password: form.password.value });
        form.reset();
        toast('Usuario creado.');
        loadUsers();
      } catch (err) { form.insertAdjacentHTML('afterbegin', `<p class="f-error" style="grid-column:1/-1">${esc(err.message)}</p>`); }
    });
    let t;
    $('.u-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadUsers, 250); });
  }
  const q = $('.u-search').value.trim();
  const list = await api.users(q ? `?q=${encodeURIComponent(q)}` : '').catch((err) => { toast(err.message, 'error'); return []; });
  const branchOpts = (sel) => `<option value="">Todas</option>${branches.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}`;
  $('#users').innerHTML = list.map((u) => `
    <tr data-id="${u.id}">
      <td><strong>${esc(u.name)}</strong><small>${esc(u.email)}${u.lastLoginAt ? ' · entró ' + ago(u.lastLoginAt) : ''}</small></td>
      <td><select data-f="role" ${u.id === me.id ? 'disabled' : ''}>${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><select data-f="branchId" ${u.role === 'cliente' ? 'disabled' : ''}>${branchOpts(u.branch?.id)}</select></td>
      <td><input type="checkbox" data-f="active" ${u.active ? 'checked' : ''} ${u.id === me.id ? 'disabled' : ''} aria-label="Activo"></td>
      <td><button type="button" class="link" data-reset-pass>Nueva contraseña</button></td>
    </tr>`).join('');
  $$('#users [data-f]').forEach((el) => el.addEventListener('change', async () => {
    const id = Number(el.closest('tr').dataset.id);
    const value = el.type === 'checkbox' ? el.checked : (el.value || null);
    try {
      await api.updateUser(id, { [el.dataset.f]: value });
      toast('Cambio guardado.');
      if (el.dataset.f === 'role') loadUsers();
    } catch (err) { toast(err.message, 'error'); loadUsers(); }
  }));
  $$('#users [data-reset-pass]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.closest('tr').dataset.id);
    passwordDialog(list.find((u) => u.id === id));
  }));
}

/* ---------- Nueva contraseña para un usuario ---------- */
const PW_RULES = [
  { test: (v) => v.length >= 8, label: 'Mínimo 8 caracteres' },
  { test: (v) => /[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(v), label: 'Al menos una letra' },
  { test: (v) => /\d/.test(v), label: 'Al menos un número' },
];

/** Contraseña fácil de dictar: sin letras que se confunden (0/O, 1/l/I). */
function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ', digits = '23456789';
  const pick = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => set[x % set.length]).join('');
  return `Miky-${pick(letters, 4)}${pick(digits, 2)}${pick(letters, 2)}${pick(digits, 2)}`;
}

function passwordDialog(u) {
  const ok = $('#users'); // referencia para no perder el foco al cerrar
  return modal({
    title: 'Nueva contraseña',
    subtitle: 'Asigna una contraseña temporal y compártela en persona.',
    body: `
      <div class="pw-user">
        <span class="pw-avatar">${esc(u.name[0].toUpperCase())}</span>
        <div><b>${esc(u.name)}</b><small>${esc(u.email)} · ${ROLE[u.role]}</small></div>
      </div>
      <label class="adj-label" for="pwInput">Contraseña temporal</label>
      <div class="pw-field">
        <input id="pwInput" name="pw" type="password" autocomplete="new-password" spellcheck="false" maxlength="200">
        <button type="button" class="pw-eye" aria-label="Mostrar contraseña" aria-pressed="false">
          <svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button type="button" class="pw-copy" aria-label="Copiar contraseña" disabled>
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
      </div>
      <button type="button" class="btn btn-outline btn-sm pw-gen">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 10a8 8 0 0 0-14.3-4.3L4 10m16 4-1.7 4.3A8 8 0 0 1 4 14"/></svg>
        Generar una segura
      </button>
      <ul class="pw-rules">${PW_RULES.map((r, i) => `<li data-rule="${i}">${r.label}</li>`).join('')}</ul>
      <p class="pw-note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
        Se cerrarán las sesiones abiertas de ${esc(u.name.split(' ')[0])}; tendrá que entrar con esta contraseña.
      </p>`,
    ok: 'Guardar contraseña',
    onOpen: (dlg) => {
      const input = dlg.querySelector('#pwInput');
      const eye = dlg.querySelector('.pw-eye');
      const copy = dlg.querySelector('.pw-copy');
      const okBtn = dlg.querySelector('.m-ok');
      const paint = () => {
        const v = input.value;
        PW_RULES.forEach((r, i) => dlg.querySelector(`[data-rule="${i}"]`).classList.toggle('ok', r.test(v)));
        const valid = PW_RULES.every((r) => r.test(v));
        okBtn.disabled = !valid;
        copy.disabled = !v;
      };
      const show = (on) => {
        input.type = on ? 'text' : 'password';
        eye.setAttribute('aria-pressed', String(on));
        eye.setAttribute('aria-label', on ? 'Ocultar contraseña' : 'Mostrar contraseña');
      };
      eye.addEventListener('click', () => show(input.type === 'password'));
      dlg.querySelector('.pw-gen').addEventListener('click', () => {
        input.value = generatePassword();
        show(true);
        paint();
        input.focus();
        input.select();
      });
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(input.value);
          copy.classList.add('done');
          setTimeout(() => copy.classList.remove('done'), 1400);
          toast('Contraseña copiada.');
        } catch { input.select(); toast('Selecciónala y cópiala con ⌘C.', 'error'); }
      });
      input.addEventListener('input', paint);
      paint();
      input.focus();
    },
    submit: async (dlg) => {
      const pw = dlg.querySelector('#pwInput').value;
      await api.resetPassword(u.id, pw);
      toast(`Contraseña de ${u.name.split(' ')[0]} actualizada. Sus sesiones anteriores se cerraron.`);
      ok.focus?.();
      return true;
    },
  });
}

/* ---------- Confirmaciones con el diseño del panel ---------- */
const CANCEL_REASONS = ['El cliente canceló', 'No se presentó', 'Sin existencia', 'Error de captura'];

/** Cancelar pedido: muestra qué se libera y pide motivo. Regresa el motivo ('' si no hay) o null. */
function cancelOrderDialog(o) {
  const pieces = o.items.reduce((n, i) => n + i.quantity, 0);
  return modal({
    title: `Cancelar ${esc(o.folio)}`,
    subtitle: `${esc(o.customer.name)} · ${esc(o.branch.name)} · ${money(o.total)}`,
    body: `
      <ul class="m-items">${o.items.map((i) => `<li><span>${i.quantity} × ${esc(i.product)} <small>${esc(i.size)}</small></span><b>${money(i.price * i.quantity)}</b></li>`).join('')}</ul>
      <p class="c-info">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/></svg>
        <span>${pieces === 1 ? 'La pieza regresa' : `Las ${pieces} piezas regresan`} al inventario de <b>${esc(o.branch.name)}</b> y el cliente verá su pedido como cancelado.</span>
      </p>
      <span class="adj-label">Motivo</span>
      <div class="adj-chips c-reasons">${CANCEL_REASONS.map((r) => `<button type="button" data-reason="${esc(r)}" aria-pressed="false">${esc(r)}</button>`).join('')}</div>
      <label class="f"><span class="sr">Otro motivo</span><input name="note" maxlength="300" placeholder="Otro motivo (opcional)"></label>`,
    ok: 'Cancelar pedido',
    okClass: 'btn-danger',
    onOpen: (dlg) => {
      dlg.querySelector('.m-cancel').textContent = 'No, volver';
      const input = dlg.querySelector('[name=note]');
      dlg.querySelectorAll('[data-reason]').forEach((b) => b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        dlg.querySelectorAll('[data-reason]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', String(on));
        input.value = on ? b.dataset.reason : '';
      }));
      input.addEventListener('input', () => dlg.querySelectorAll('[data-reason]').forEach((x) =>
        x.setAttribute('aria-pressed', String(x.dataset.reason === input.value))));
    },
    submit: async (dlg) => dlg.querySelector('[name=note]').value.trim(),
  });
}

const CONTENT_LABEL = {
  'hero.eyebrow': 'Portada · etiqueta', 'hero.title': 'Portada · título', 'hero.tagline': 'Portada · lema', 'hero.lead': 'Portada · texto',
  'hero.image': 'Portada · foto principal', 'hero.side': 'Portada · foto pequeña',
  'menu.title': 'Menú · título', 'menu.subtitle': 'Menú · subtítulo',
  'about.title': 'Nosotros · título', 'about.kicker': 'Nosotros · frase', 'about.p1': 'Nosotros · párrafo 1', 'about.p2': 'Nosotros · párrafo 2',
  'ice.title': 'Helados · título', 'ice.text': 'Helados · texto', 'ice.image': 'Helados · foto',
  'stores.title': 'Sucursales · título', 'stores.subtitle': 'Sucursales · subtítulo', 'stores.hint': 'Sucursales · aviso',
  'reviews.eyebrow': 'Opiniones · etiqueta', 'closing.title': 'Cierre · título', 'closing.text': 'Cierre · texto',
};

/** Restaurar un texto o imagen del sitio a su versión original. */
function restoreDialog(key, c) {
  const isImg = c?.kind === 'image';
  return modal({
    title: 'Restaurar original',
    subtitle: esc(CONTENT_LABEL[key] || key),
    body: `
      <span class="adj-label">Ahora se ve así</span>
      ${isImg ? `<img class="r-img" src="${esc(c.value)}" alt="">` : `<blockquote class="r-text">${esc(c?.value || '')}</blockquote>`}
      <p class="c-info">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6"/><path d="M20 12a8 8 0 0 0-14.3-5L4 10"/><path d="M20 20v-6h-6"/><path d="M4 12a8 8 0 0 0 14.3 5L20 14"/></svg>
        <span>${isImg ? 'La foto' : 'El texto'} regresará a como venía en el diseño original del sitio. Puedes volver a editarlo cuando quieras.</span>
      </p>`,
    ok: 'Restaurar original',
    onOpen: (dlg) => { dlg.querySelector('.m-cancel').textContent = 'Dejar como está'; },
    submit: async () => { await api.resetContent(key); return true; },
  });
}

boot();
