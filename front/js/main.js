/* Pastelerías Miky — interacción del sitio.
   Productos, precios y sucursales vienen de la base de datos (API /api/catalog y /api/branches). */
import { api } from './api.js';
import { initStore } from './store.js';
import { initCms } from './cms.js';

/* ---------- WhatsApp ----------
   Pon aquí el número de Miky con lada de país, sin espacios ni signos (ej. '5233XXXXXXXX').
   Mientras esté vacío, el botón abre WhatsApp con el mensaje listo para elegir el contacto. */
const WHATSAPP = { number: '', message: 'Hola Miky, me gustaría hacer un pedido 🎂' };

/* ---------- Datos desde el back ---------- */
let catalog = { categories: [], products: [] }, branches = [];
try {
  [catalog, branches] = await Promise.all([api.catalog(), api.branches()]);
} catch (err) {
  console.error(err);
  document.querySelector('#dishes').innerHTML = '<p class="load-error">No pudimos cargar el menú. Recarga la página en un momento.</p>';
}
const products = catalog.products;
// Productos por categoría para las pestañas del menú
const MENU = Object.fromEntries(catalog.categories.map((c) => [c.slug, products.filter((p) => p.category === c.slug)]));
// Sucursales con el formato que usa la sección de franjas
const STORES = branches.map((b) => ({ id: b.id, state: b.state, name: b.name, addr: b.address, tel: b.phones, img: b.photo, tex: b.texture }));

ProductModal.register(products.map((p) => ({
  id: p.slug, pid: p.id, name: p.name, cat: p.categoryName, img: p.image, color: p.color,
  desc: p.description, full: p.full,
  sizes: p.sizes.map((z) => ({ id: z.id, label: z.label, serves: z.serves, price: z.price, img: z.image })),
})));
initStore({ products, branches });
initCms();

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Menú con pestañas ---------- */
const dishesEl = $('#dishes');
const tabButtons = $$('.tabs button');
const ink = $('.tabs-ink');

function moveInk(btn) {
  ink.style.left = btn.offsetLeft + 12 + 'px';
  ink.style.width = btn.offsetWidth - 24 + 'px';
}

/* ---------- Productos estrella: carrusel de muestras de 2 en 2 ---------- */
const AUTOPLAY_MS = 7000;
const carousel = {
  track: null, slides: [], index: 0, timer: null,
  hovering: false, focused: false, touchedAt: 0, visible: false,
  dots: $('.sw-dots'), prev: $('.sw-prev'), next: $('.sw-next'),
};

function swatchCard(d, i, side) {
  const { color, swatch: { code, tone } } = d;
  const from = Math.min(...d.sizes.map((z) => z.price));
  const tilt = [-12, 9, -7, 11, -9, 7][i % 6];
  return `
    <a class="swatch ${side}" href="#producto/${d.slug}" data-product="${d.slug}" style="--c:${color};--r:${tilt}deg"
       aria-label="${esc(d.name)}, desde $${from}. Ver en grande">
      <span class="sw-chip"></span>
      <img class="sw-photo" src="${d.image}" alt="" loading="lazy" width="400" height="500">
      <span class="sw-label">
        <!-- Código tipo Pantone oculto por ahora: <strong class="sw-code">MIKY<sup>®</sup> ${code}</strong> -->
        <span class="sw-name">${esc(d.name)}</span>
        <span class="sw-meta">${esc(tone)} · desde $${from}</span>
      </span>
    </a>`;
}

function showCategory(cat) {
  tabButtons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cat === cat)));
  moveInk(tabButtons.find((b) => b.dataset.cat === cat));

  const items = MENU[cat] || [];
  const pairs = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));

  dishesEl.innerHTML = `<div class="sw-track" tabindex="0" aria-label="Productos, usa las flechas para cambiar">${
    pairs.map((pair, p) => `
      <div class="sw-slide${pair.length === 1 ? ' single' : ''}" role="group" aria-roledescription="diapositiva" aria-label="${p + 1} de ${pairs.length}">
        ${pair.map((d, k) => swatchCard(d, p * 2 + k, k === 0 ? 'left' : 'right')).join('')}
      </div>`).join('')
  }</div>`;

  carousel.track = $('.sw-track', dishesEl);
  carousel.slides = $$('.sw-slide', dishesEl);
  carousel.dots.innerHTML = carousel.slides.map((_, i) =>
    `<button type="button" role="tab" aria-label="Ver par ${i + 1}" data-dot="${i}"><span></span></button>`).join('');
  carousel.track.addEventListener('scroll', onTrackScroll, { passive: true });
  carousel.track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(carousel.index + 1, true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(carousel.index - 1, true); }
  });
  carousel.track.addEventListener('pointerdown', () => { carousel.touchedAt = Date.now(); restartTimer(); });
  carousel.index = 0;
  carousel.track.scrollLeft = 0;
  setSlide(0);
  restartTimer();
}

function goTo(i, manual = false) {
  const n = carousel.slides.length;
  if (!n) return;
  i = (i + n) % n;                                   // da la vuelta al llegar al final
  carousel.track.scrollTo({ left: carousel.slides[i].offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
  setSlide(i);
  if (manual) { carousel.touchedAt = Date.now(); restartTimer(); }
}

function setSlide(i) {
  carousel.index = i;
  carousel.slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
  $$('button', carousel.dots).forEach((d, k) => {
    d.setAttribute('aria-selected', String(k === i));
    d.classList.remove('run'); void d.offsetWidth;   // reinicia la barra de progreso
    if (k === i) d.classList.add('run');
  });
  const single = carousel.slides.length < 2;
  carousel.prev.hidden = carousel.next.hidden = carousel.dots.hidden = single;
}

let scrollIdle;
function onTrackScroll() {
  clearTimeout(scrollIdle);
  scrollIdle = setTimeout(() => {
    const t = carousel.track;
    const i = Math.round(t.scrollLeft / t.clientWidth);
    if (i !== carousel.index) { setSlide(i); restartTimer(); }
  }, 90);
}

// el avance automático se pausa con el cursor encima, con foco dentro,
// fuera de pantalla, con la pestaña oculta o con la ventana de producto abierta
function paused() {
  return carousel.hovering || carousel.focused || !carousel.visible || document.hidden
    || reduceMotion || document.documentElement.classList.contains('pm-lock');
}
function restartTimer() {
  clearTimeout(carousel.timer);
  dishesEl.classList.toggle('is-paused', paused());
  if (carousel.slides.length < 2 || paused()) return;
  const dot = $$('button', carousel.dots)[carousel.index];   // la barra arranca junto con el temporizador
  if (dot) { dot.classList.remove('run'); void dot.offsetWidth; dot.classList.add('run'); }
  carousel.timer = setTimeout(() => {
    if (paused()) return restartTimer();
    goTo(carousel.index + 1);
    restartTimer();
  }, AUTOPLAY_MS);
}

carousel.prev.addEventListener('click', () => goTo(carousel.index - 1, true));
carousel.next.addEventListener('click', () => goTo(carousel.index + 1, true));
carousel.dots.addEventListener('click', (e) => { const d = e.target.closest('[data-dot]'); if (d) goTo(+d.dataset.dot, true); });
dishesEl.addEventListener('mouseenter', () => { carousel.hovering = true; restartTimer(); });
dishesEl.addEventListener('mouseleave', () => { carousel.hovering = false; restartTimer(); });
dishesEl.addEventListener('focusin', () => { carousel.focused = true; restartTimer(); });
dishesEl.addEventListener('focusout', (e) => { if (!dishesEl.contains(e.relatedTarget)) { carousel.focused = false; restartTimer(); } });
document.addEventListener('visibilitychange', restartTimer);
new MutationObserver(restartTimer).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
new IntersectionObserver(([e]) => { carousel.visible = e.isIntersecting; restartTimer(); }, { threshold: 0.35 }).observe(dishesEl);
addEventListener('resize', () => carousel.track && (carousel.track.scrollLeft = carousel.slides[carousel.index].offsetLeft));

tabButtons.forEach((b) => b.addEventListener('click', () => showCategory(b.dataset.cat)));
$$('[data-goto]').forEach((a) => a.addEventListener('click', () => showCategory(a.dataset.goto)));
if (products.length) showCategory('pasteles');
addEventListener('resize', () => moveInk($('.tabs [aria-selected="true"]')));
document.fonts?.ready.then(() => moveInk($('.tabs [aria-selected="true"]')));

/* ---------- Sucursales: franjas verticales + mapa con revelado circular ---------- */
const stripsEl = $('#strips');
const rowEl = $('#stripRow');
const viewEl = $('#storeView');
const mapEl = $('#storeMap');
const mapsQuery = (s) => encodeURIComponent(`Pastelería Miky, ${s.addr}`);
const pinSvg = '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
let shownStores = [];
let storeIdx = -1;
let lastStrip = null;

function showState(state) {
  if (!viewEl.hidden) closeStore(true);
  $$('.segmented button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.state === state)));
  shownStores = STORES.filter((s) => s.state === state);
  rowEl.innerHTML = shownStores.map((s, i) => `
    <button class="strip" type="button" style="--i:${i}" data-i="${i}" aria-label="Ver ${esc(s.name)} en el mapa">
      <img src="${s.tex}" alt="" loading="lazy" width="420" height="1000">
      <span class="strip-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="strip-name">${esc(s.name)}</span>
      <span class="strip-pin" aria-hidden="true">${pinSvg}</span>
    </button>`).join('');
}

function fillStore(i) {
  storeIdx = (i + shownStores.length) % shownStores.length;
  const s = shownStores[storeIdx];
  $('.sv-photo', viewEl).innerHTML = `<img src="${s.img || s.tex}" alt="${s.img ? 'Fachada de la sucursal ' + esc(s.name) : ''}">`;
  $('.sv-state', viewEl).textContent = `${s.state} · ${String(storeIdx + 1).padStart(2, '0')}/${String(shownStores.length).padStart(2, '0')}`;
  $('.sv-name', viewEl).textContent = s.name;
  $('.sv-addr', viewEl).textContent = s.addr;
  $('.sv-actions', viewEl).innerHTML =
    s.tel.map((t) => `<a class="sv-tel" href="tel:+52${t.replace(/\s/g, '')}">${esc(t)}</a>`).join('') +
    `<a class="btn btn-solid sv-go" href="https://www.google.com/maps/search/?api=1&query=${mapsQuery(s)}" target="_blank" rel="noopener">Cómo llegar ↗</a>`;
  viewEl.classList.remove('map-ready');
  mapEl.src = `https://maps.google.com/maps?q=${mapsQuery(s)}&z=16&hl=es&output=embed`;
}
mapEl.addEventListener('load', () => viewEl.classList.add('map-ready'));

function openStore(i, strip, e) {
  lastStrip = strip;
  const box = stripsEl.getBoundingClientRect();
  const r = strip.getBoundingClientRect();
  // el círculo nace donde tocaste (o del centro de la franja con teclado)
  const x = (e && e.clientX ? e.clientX : r.left + r.width / 2) - box.left;
  const y = (e && e.clientY ? e.clientY : r.top + r.height / 2) - box.top;
  viewEl.style.setProperty('--ox', x + 'px');
  viewEl.style.setProperty('--oy', y + 'px');
  fillStore(i);
  viewEl.hidden = false;
  stripsEl.classList.add('is-open');
  requestAnimationFrame(() => requestAnimationFrame(() => viewEl.classList.add('is-in')));
  $('.sv-close', viewEl).focus({ preventScroll: true });
}

function closeStore(instant = false) {
  if (viewEl.hidden) return;
  if (lastStrip) {
    const box = stripsEl.getBoundingClientRect(), r = lastStrip.getBoundingClientRect();
    viewEl.style.setProperty('--ox', r.left + r.width / 2 - box.left + 'px');
    viewEl.style.setProperty('--oy', r.top + r.height / 2 - box.top + 'px');
  }
  viewEl.classList.remove('is-in');
  stripsEl.classList.remove('is-open');
  const done = () => { viewEl.hidden = true; mapEl.removeAttribute('src'); };
  if (instant || reduceMotion) return done();
  setTimeout(done, 650);
  lastStrip?.focus({ preventScroll: true });
}

rowEl.addEventListener('click', (e) => {
  const strip = e.target.closest('.strip');
  if (strip) openStore(+strip.dataset.i, strip, e);
});
$('.sv-close', viewEl).addEventListener('click', () => closeStore());
$('.sv-prev', viewEl).addEventListener('click', () => { fillStore(storeIdx - 1); lastStrip = $$('.strip', rowEl)[storeIdx]; });
$('.sv-next', viewEl).addEventListener('click', () => { fillStore(storeIdx + 1); lastStrip = $$('.strip', rowEl)[storeIdx]; });
viewEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStore(); });

$$('.segmented button').forEach((b) => b.addEventListener('click', () => showState(b.dataset.state)));
if (STORES.length) showState('Colima');

/* ---------- Lo que dicen de nosotros: tarjetas estilo Instagram ----------
   IMPORTANTE: son reseñas DE EJEMPLO. Reemplázalas por opiniones reales (Google, Facebook,
   Instagram) con permiso del cliente antes de publicar, y quita `example: true`.
   Las caras (img/persona-*.webp) son fotos de relleno de pravatar.cc: cámbialas por fotos
   reales de los clientes, con su autorización, antes de publicar. */
const REVIEWS = [
  { user: 'cliente_1', place: 'Sevilla del Río', face: 'persona-1', dish: 'Pastel de Zanahoria', img: 'zanahoria', color: '#e07b39', example: true,
    text: 'El pastel de zanahoria es el favorito de la familia para cada cumpleaños. 🥕🎂' },
  { user: 'cliente_2', place: 'Benito Juárez', face: 'persona-2', dish: 'Pay de Limón', img: 'pay-limon', color: '#e8c48f', example: true,
    text: 'El pay de limón con su merengue horneado nunca falla en la sobremesa. 🍋' },
  { user: 'cliente_3', place: 'Matriz Ciudad Granja', face: 'persona-3', dish: 'Tres Leches Fresa', img: 'tres-leches-fresa', color: '#d9545b', example: true,
    text: 'Llevamos el tres leches de fresa a una reunión y no sobró ni una rebanada. 🍓' },
  { user: 'cliente_4', place: 'Constitución', face: 'persona-4', dish: 'Helado de Fresa', img: 'helados', color: '#f2b8c6', example: true,
    text: 'Tarde de calor = helado de fresa de Miky. Así de simple. 🍦' },
  { user: 'cliente_5', place: 'La Estancia', face: 'persona-5', dish: 'Caja de Brownies', img: 'brownies-16', color: '#3e2a22', example: true,
    text: 'La caja de brownies con nuez para el café de la oficina, siempre un éxito. ☕' },
  { user: 'cliente_6', place: 'Real Hacienda', face: 'persona-6', dish: 'Red Velvet', img: 'red-velvet', color: '#b23a3e', example: true,
    text: 'El Red Velvet tiene el equilibrio perfecto con su cobertura de queso crema. ❤️' },
];

// Órbita: los productos giran sobre un círculo; el activo queda arriba y en grande al centro
const testi = {
  ring: $('#orbitRing'), center: $('.orbit-center img'), body: $('.testi-body'),
  dish: $('.orbit-dish'), dishImg: $('.orbit-dish img'), dishName: $('.orbit-dish-name'),
  quote: $('.testi-quote'), name: $('.testi-name'), place: $('.testi-place'),
  cur: $('.testi-cur'), tot: $('.testi-tot'), line: $('.testi-line span'),
  index: 0, angle: 0, timer: null, hover: false, visible: false,
};
const STEP = 360 / REVIEWS.length;

testi.ring.innerHTML = REVIEWS.map((r, i) => `
  <div class="orbit-slot" style="transform: rotate(${i * STEP}deg)">
    <button class="orbit-av" type="button" data-i="${i}" style="--c:${r.color}" aria-label="Ver opinión ${i + 1}">
      <img src="img/${r.face}.webp" alt="" loading="lazy" width="480" height="480">
    </button>
  </div>`).join('');
testi.tot.textContent = String(REVIEWS.length).padStart(2, '0');

function showReview(i, dir = 1) {
  const n = REVIEWS.length;
  const next = (i + n) % n;
  // gira por el camino corto y acumula el ángulo para no dar vueltas completas
  let delta = next - testi.index;
  if (delta > n / 2) delta -= n;
  if (delta < -n / 2) delta += n;
  if (delta === 0 && dir) delta = 0;
  testi.angle -= delta * STEP;
  testi.index = next;
  const r = REVIEWS[next];

  testi.ring.style.transform = `rotate(${testi.angle}deg)`;
  $$('.orbit-av', testi.ring).forEach((b, k) => {
    b.style.transform = `translate(-50%, -50%) rotate(${-(testi.angle + k * STEP)}deg) scale(${k === next ? 1.35 : 1})`;
    b.classList.toggle('is-active', k === next);
    b.setAttribute('aria-current', String(k === next));
  });

  testi.body.classList.remove('swap'); void testi.body.offsetWidth; testi.body.classList.add('swap');
  testi.quote.textContent = `“${r.text}”`;
  testi.name.textContent = r.example ? 'Cliente de ejemplo' : r.user;
  testi.place.textContent = `Sucursal ${r.place}${r.example ? ' · reseña de ejemplo' : ''}`;
  testi.cur.textContent = String(next + 1).padStart(2, '0');
  testi.center.parentElement.style.setProperty('--c', r.color);
  testi.center.classList.remove('swap'); void testi.center.offsetWidth;
  testi.center.src = `img/${r.face}.webp`; testi.center.alt = r.example ? 'Foto de ejemplo' : r.user;
  testi.center.classList.add('swap');
  // a un lado: el pastel que comió
  testi.dish.style.setProperty('--c', r.color);
  testi.dishImg.src = `img/${r.img}.webp`; testi.dishImg.alt = r.dish;
  testi.dishName.textContent = r.dish;
  testi.dish.classList.remove('swap'); void testi.dish.offsetWidth; testi.dish.classList.add('swap');
  restartTesti();
}

function restartTesti() {
  clearTimeout(testi.timer);
  testi.line.classList.remove('run'); void testi.line.offsetWidth;
  if (testi.hover || !testi.visible || document.hidden || reduceMotion) return;
  testi.line.classList.add('run');
  testi.timer = setTimeout(() => showReview(testi.index + 1), AUTOPLAY_MS);
}

testi.ring.addEventListener('click', (e) => { const b = e.target.closest('.orbit-av'); if (b) showReview(+b.dataset.i); });
$('.orbit-prev').addEventListener('click', () => showReview(testi.index - 1, -1));
$('.orbit-next').addEventListener('click', () => showReview(testi.index + 1));
const testiSec = $('#opiniones');
testiSec.addEventListener('mouseenter', () => { testi.hover = true; restartTesti(); });
testiSec.addEventListener('mouseleave', () => { testi.hover = false; restartTesti(); });
document.addEventListener('visibilitychange', restartTesti);
new IntersectionObserver(([e]) => { testi.visible = e.isIntersecting; restartTesti(); }, { threshold: 0.4 }).observe(testiSec);
// deslizar sobre la órbita en el celular
let tx0 = null;
$('.testi-orbit').addEventListener('touchstart', (e) => { tx0 = e.touches[0].clientX; }, { passive: true });
$('.testi-orbit').addEventListener('touchend', (e) => {
  if (tx0 === null) return;
  const dx = e.changedTouches[0].clientX - tx0; tx0 = null;
  if (Math.abs(dx) > 40) showReview(testi.index + (dx < 0 ? 1 : -1));
});
showReview(0, 0);

/* ---------- Encabezado al hacer scroll ---------- */
const topbar = $('.topbar');

/* ---------- Parallax ---------- */
const floaters = $$('[data-speed]');
const spinners = $$('[data-spin]');

function parallax() {
  const vh = innerHeight;
  topbar.classList.toggle('scrolled', scrollY > 20);
  if (reduceMotion) return;
  for (const el of floaters) {
    // se mide contra la sección para no depender del propio transform
    const sec = el.closest('section') || el.parentElement;
    const r = sec.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const delta = r.top + r.height / 2 - vh / 2;
    el.style.setProperty('--py', (-delta * parseFloat(el.dataset.speed)).toFixed(1) + 'px');
    if (el.dataset.rot) el.style.setProperty('--rot', (delta / vh * parseFloat(el.dataset.rot)).toFixed(2) + 'deg');
  }
  for (const el of spinners) {
    const r = el.closest('section').getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    el.style.setProperty('--spin', (-r.top * parseFloat(el.dataset.spin)).toFixed(2) + 'deg');
  }
}

let ticking = false;
addEventListener('scroll', () => {
  if (!ticking) { ticking = true; requestAnimationFrame(() => { parallax(); ticking = false; }); }
}, { passive: true });
addEventListener('resize', parallax);
parallax();

/* ---------- Aparición al entrar en pantalla ---------- */
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } });
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
$$('.reveal').forEach((el) => revealIO.observe(el));

/* ---------- Sección activa: menú inferior y navegación ---------- */
const tabbar = $('.tabbar');
const tabs = $$('.tab');
const navLinks = $$('.nav a');
const ORDER = ['inicio', 'menu', 'nosotros', 'helados', 'sucursales'];

function setActive(id) {
  if (id === 'contacto' || id === 'opiniones') id = 'sucursales';
  const i = ORDER.indexOf(id);
  if (i < 0) return;
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
  tabs.forEach((t) => t.toggleAttribute('aria-current', t.dataset.tab === id));
  navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
  tabbar.style.setProperty('--nx', (i * 20 + 10) + '%');
}

const spyIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
}, { rootMargin: '-45% 0px -50% 0px' });
$$('[data-section]').forEach((s) => spyIO.observe(s));

tabs.forEach((t) => t.addEventListener('click', () => setActive(t.dataset.tab)));
setActive('inicio');

/* ---------- Escritorio: botón de flecha que sube de sección en sección ----------
   Cada clic sube a la sección anterior; en el inicio se oculta. */
const jumpBtn = $('.sec-jump');
const sections = $$('[data-section]');
const prevSection = () => sections.filter((s) => s.getBoundingClientRect().top < -8).pop();
function updateJump() {
  jumpBtn.classList.toggle('is-hidden', scrollY < 120);
}
jumpBtn.addEventListener('click', () => {
  const prev = prevSection();
  scrollTo({ top: prev ? prev.getBoundingClientRect().top + scrollY : 0, behavior: reduceMotion ? 'auto' : 'smooth' });
});
addEventListener('scroll', () => requestAnimationFrame(updateJump), { passive: true });
updateJump();
// el aviso se muestra unos segundos la primera vez que aparece el botón y luego sólo al pasar el cursor
let tipShown = false;
addEventListener('scroll', () => {
  if (tipShown || scrollY < 120) return;
  tipShown = true;
  jumpBtn.classList.add('tip-on');
  setTimeout(() => jumpBtn.classList.remove('tip-on'), 4500);
}, { passive: true });

$('.wa-float').href = `https://wa.me/${WHATSAPP.number}?text=${encodeURIComponent(WHATSAPP.message)}`;
$('#year').textContent = new Date().getFullYear();
