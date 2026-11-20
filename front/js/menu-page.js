/* Pastelerías Miky — página «Menú» (/menu/): todo el catálogo en cuadrícula,
   con pestañas de categoría, buscador y existencias por sucursal.
   La tarjeta, la ventana de producto, el carrito y la cuenta son los mismos del inicio. */
import { api } from './api.js';
import { initStore } from './store.js';
import { initCms } from './cms.js';
import { whatsappUrl } from './config.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// búsqueda sin acentos ni mayúsculas: «limon» encuentra «Limón»
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LAST_BRANCH = 'miky_branch';   // la misma clave que usa el carrito para recordar la sucursal
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
};

const gridEl = $('#mpGrid');
const countEl = $('#mpCount');
const tabsEl = $('.mp-tabs');
const ink = $('.tabs-ink', tabsEl);
const queryEl = $('#mpQuery');
const branchEl = $('#mpBranch');

/* ---------- Datos desde el back ---------- */
let catalog = { categories: [], products: [] }, branches = [];
try {
  [catalog, branches] = await Promise.all([api.catalog(), api.branches()]);
} catch (err) {
  console.error(err);
  gridEl.innerHTML = '<p class="load-error">No pudimos cargar el menú. Recarga la página en un momento.</p>';
}
const products = catalog.products;
products.forEach((p) => { p.haystack = norm(`${p.name} ${p.categoryName} ${p.description} ${p.swatch?.tone || ''}`); });

ProductModal.register(products.map((p) => ({
  id: p.slug, pid: p.id, name: p.name, cat: p.categoryName, img: p.image, color: p.color,
  desc: p.description, full: p.full,
  sizes: p.sizes.map((z) => ({ id: z.id, label: z.label, serves: z.serves, price: z.price, img: z.image })),
})));
initStore({ products, branches });
initCms();

/* ---------- Estado ---------- */
const params = new URLSearchParams(location.search);
const state = {
  cat: catalog.categories.some((c) => c.slug === params.get('cat')) ? params.get('cat') : 'todos',
  q: params.get('q') || '',
  branch: null,   // { id, name }
  stock: null,    // { variantId: piezas } de la sucursal elegida
};

/* ---------- Pestañas ---------- */
ink.insertAdjacentHTML('beforebegin', catalog.categories.map((c) =>
  `<button role="tab" aria-selected="false" data-cat="${c.slug}">${esc(c.name)}</button>`).join(''));
const tabButtons = $$('button', tabsEl);

function moveInk() {
  const btn = tabButtons.find((b) => b.dataset.cat === state.cat);
  if (!btn) return;
  ink.style.left = btn.offsetLeft + 12 + 'px';
  ink.style.width = btn.offsetWidth - 24 + 'px';
  // en el celular las pestañas se deslizan: deja visible la elegida
  const box = tabsEl.getBoundingClientRect(), r = btn.getBoundingClientRect();
  if (r.left < box.left || r.right > box.right) tabsEl.scrollBy({ left: r.left - box.left - 24, behavior: 'smooth' });
}

tabButtons.forEach((b) => b.addEventListener('click', () => {
  state.cat = b.dataset.cat;
  render();
  syncUrl();
}));

/* ---------- Sucursales ---------- */
const states = [...new Set(branches.map((b) => b.state))];
branchEl.insertAdjacentHTML('beforeend', states.map((st) => `<optgroup label="${esc(st)}">${
  branches.filter((b) => b.state === st).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')
}</optgroup>`).join(''));

async function setBranch(id) {
  const b = branches.find((x) => String(x.id) === String(id));
  branchEl.value = b ? String(b.id) : '';
  branchEl.closest('.mp-branch').classList.toggle('is-set', Boolean(b));
  if (!b) { state.branch = state.stock = null; return render(); }
  ls.set(LAST_BRANCH, String(b.id));
  state.branch = { id: b.id, name: b.name };
  try {
    state.stock = await api.stock(b.id);
  } catch {
    state.stock = null;
  }
  render();
}
branchEl.addEventListener('change', () => setBranch(branchEl.value));

/* ---------- Buscador ---------- */
let typing;
queryEl.value = state.q;
queryEl.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(() => { state.q = queryEl.value.trim(); render(); syncUrl(); }, 120);
});

function syncUrl() {
  const p = new URLSearchParams();
  if (state.cat !== 'todos') p.set('cat', state.cat);
  if (state.q) p.set('q', state.q);
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
}

/* ---------- Tarjetas ---------- */
const from = (p) => Math.min(...p.sizes.map((z) => z.price));
// null = no se eligió sucursal; si no, cuántas piezas hay de todas sus presentaciones
const piecesHere = (p) => (state.stock ? p.sizes.reduce((n, z) => n + (state.stock[z.id] || 0), 0) : null);

function card(p, i, group) {
  const here = piecesHere(p);
  const out = here === 0;
  const tilt = [-8, 6, -5, 7, -6, 5][i % 6];
  return `
    <a class="mcard${out ? ' is-out' : ''}" href="#producto/${p.slug}" data-product="${p.slug}" data-product-group="${group}"
       style="--c:${p.color};--r:${tilt}deg;--i:${Math.min(i, 12)}"
       aria-label="${esc(p.name)}, desde $${from(p)}${out ? `, agotado en ${esc(state.branch.name)}` : ''}. Ver y pedir">
      <span class="mc-chip">
        <img class="mc-photo" src="${p.image}" alt="" loading="lazy" width="400" height="500">
        ${here === null ? '' : `<span class="mc-stock${out ? ' out' : ''}">${out ? 'Agotado aquí' : 'Disponible'}</span>`}
      </span>
      <span class="mc-label">
        <span class="sw-name">${esc(p.name)}</span>
        <span class="mc-desc">${esc(p.description)}</span>
        <span class="sw-cta" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
          Pedir
          <svg class="sw-cta-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </span>
        <span class="sw-meta">${esc(p.swatch?.tone || p.categoryName)} · desde $${from(p)}</span>
      </span>
    </a>`;
}

function render() {
  tabButtons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cat === state.cat)));
  moveInk();
  if (!products.length) return;

  const words = norm(state.q).split(/\s+/).filter(Boolean);
  const match = (p) => words.every((w) => p.haystack.includes(w));
  const cats = state.cat === 'todos' ? catalog.categories : catalog.categories.filter((c) => c.slug === state.cat);
  // con sucursal elegida, lo agotado va al final de cada grupo
  const sorted = (list) => (state.stock ? [...list].sort((a, b) => (piecesHere(b) > 0) - (piecesHere(a) > 0)) : list);
  const groups = cats
    .map((c) => ({ ...c, items: sorted(products.filter((p) => p.category === c.slug && match(p))) }))
    .filter((g) => g.items.length);

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const avail = state.stock ? groups.reduce((n, g) => n + g.items.filter((p) => piecesHere(p) > 0).length, 0) : null;
  countEl.innerHTML = !total ? '' : `${total} ${total === 1 ? 'producto' : 'productos'}${
    state.branch ? ` · <strong>${avail} disponibles</strong> en ${esc(state.branch.name)}` : ''}`;

  if (!total) {
    gridEl.innerHTML = `
      <div class="mp-empty">
        <p>No encontramos «${esc(state.q)}»${state.cat !== 'todos' ? ' en esta categoría' : ''}.</p>
        <button type="button" class="btn btn-outline" data-reset>Ver todo el menú</button>
      </div>`;
    $('[data-reset]', gridEl).addEventListener('click', () => {
      state.q = ''; queryEl.value = ''; state.cat = 'todos'; render(); syncUrl();
    });
    return;
  }

  gridEl.innerHTML = groups.map((g) => {
    const ids = g.items.map((p) => p.slug).join(',');   // anterior/siguiente en la ventana recorre lo que se ve
    return `
      <section class="mp-group" aria-label="${esc(g.name)}">
        ${state.cat === 'todos' ? `<h2 class="mp-group-title">${esc(g.name)} <span>${g.items.length}</span></h2>` : ''}
        <div class="mp-grid">${g.items.map((p, i) => card(p, i, ids)).join('')}</div>
      </section>`;
  }).join('');
}

/* ---------- Arranque ---------- */
render();
const saved = ls.get(LAST_BRANCH);
if (saved && branches.some((b) => String(b.id) === String(saved))) setBranch(saved);
addEventListener('resize', moveInk);
document.fonts?.ready.then(moveInk);

// encabezado con fondo al bajar, como en el inicio; la barra de filtros se pega justo debajo
const topbar = $('.topbar');
const bar = $('.mp-bar');
let topH = 0;
const onScroll = () => {
  topbar.classList.toggle('scrolled', scrollY > 20);
  const h = topbar.offsetHeight;   // cambia al compactarse el encabezado
  if (h !== topH) { topH = h; document.documentElement.style.setProperty('--top-h', h + 'px'); }
  bar.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= h + 1);
};
topbar.addEventListener('transitionend', onScroll);
addEventListener('resize', onScroll);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// en el celular: textos cortos para que quepan el buscador y la sucursal en un renglón
const narrow = matchMedia('(max-width: 820px)');
const fitLabels = () => {
  queryEl.placeholder = narrow.matches ? 'Buscar' : 'Buscar: tres leches, limón, brownie…';
  branchEl.options[0].textContent = narrow.matches ? 'Sucursal' : 'Todas las sucursales';
};
narrow.addEventListener('change', fitLabels);
fitLabels();
const tabsEnd = () => tabsEl.classList.toggle('at-end', tabsEl.scrollLeft + tabsEl.clientWidth >= tabsEl.scrollWidth - 4);
tabsEl.addEventListener('scroll', tabsEnd, { passive: true });
addEventListener('resize', tabsEnd);
tabsEnd();

$('.wa-float').href = whatsappUrl();
$('#year').textContent = new Date().getFullYear();
