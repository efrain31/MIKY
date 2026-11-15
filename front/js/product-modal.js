/* ==========================================================
   ProductModal — ventana de detalle de producto (componente global)

   Uso:
     1. Incluir css/product-modal.css y js/product-modal.js.
     2. Registrar los productos:
          ProductModal.register([{ id, name, cat, img, desc, full?, sizes: [{ id?, label, serves?, price, img? }] }])
        (img y sizes[].img son rutas completas, p. ej. /img/red-velvet.webp)
     3. Cualquier elemento con data-product="<id>" abre la ventana al hacer clic.
        También se puede abrir desde código: ProductModal.open('red-velvet').
     4. Opcional — acciones de la tienda:
          ProductModal.configure({ onAdd(product, size, qty), isFavorite(product), onToggleFavorite(product),
                                   loadSummary(product), onRate(product, stars) })
        loadSummary → { stock: { sizeId: { total, branches, here: { name, qty } | null } }, rating: { avg, count, mine } }
        onRate      → la nueva calificación (o undefined si hubo que iniciar sesión)

   Incluye: navegación anterior/siguiente dentro de la misma categoría,
   presentaciones con precio y foto propia, enlace directo (#producto/<id>),
   botón "atrás" del celular para cerrar, deslizar para cerrar en móvil,
   teclado (Esc, ←, →), transición de la foto desde la tarjeta, existencias de la presentación
  elegida y calificación de 1 a 5 estrellas.
   ========================================================== */

window.ProductModal = (() => {
  const products = new Map();
  let hooks = {};         // acciones de la tienda (carrito y favoritos), ver configure()
  const HASH = '#producto/';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = (n) => '$' + n.toLocaleString('es-MX');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let dlg, ui;
  let group = [];        // ids que se recorren con anterior/siguiente
  let current = null;    // producto abierto
  let sizeIdx = 0;
  let qty = 1;
  let pushedHistory = false;
  let summary = null;     // existencias y calificación del producto abierto (llegan aparte)

  /* ---------- marcado (se crea una sola vez) ---------- */
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'pm';
    dlg.setAttribute('aria-labelledby', 'pm-title');
    dlg.innerHTML = `
      <div class="pm-sheet">
        <div class="pm-grab" aria-hidden="true"><span></span></div>
        <button class="pm-close" type="button" aria-label="Cerrar">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>

        <div class="pm-stage">
          <span class="pm-plate" aria-hidden="true"></span>
          <span class="pm-sprinkles a" aria-hidden="true"></span>
          <span class="pm-sprinkles b" aria-hidden="true"></span>
          <img class="pm-img" alt="">
          <div class="pm-nav">
            <button class="pm-prev" type="button" aria-label="Producto anterior"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
            <span class="pm-count" aria-live="polite"></span>
            <button class="pm-next" type="button" aria-label="Producto siguiente"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
          </div>
        </div>

        <div class="pm-body">
          <p class="pm-cat"></p>
          <h2 id="pm-title" class="pm-title"></h2>
          <p class="pm-desc"></p>

          <div class="pm-sizes-wrap">
            <h3 class="pm-label">Presentaciones</h3>
            <div class="pm-sizes" role="radiogroup" aria-label="Presentación"></div>
          </div>

          <div class="pm-extra">
            <p class="pm-stock" aria-live="polite"></p>
            <div class="pm-rating">
              <div class="pm-stars" role="radiogroup" aria-label="Califica este producto">
                ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} de 5"><i><b></b></i></button>`).join('')}
              </div>
              <span class="pm-rating-num"></span>
              <span class="pm-rating-count"></span>
              <small class="pm-rating-hint"></small>
            </div>
          </div>

          <p class="pm-note">Precios en sucursal, sujetos a cambio sin previo aviso.</p>
          <div class="pm-buy">
          <div class="pm-price-row">
            <div>
              <span class="pm-price"></span>
              <span class="pm-serves"></span>
            </div>
          </div>

          <div class="pm-actions">
            <div class="pm-qty" aria-label="Cantidad">
              <button type="button" class="pm-qty-minus" aria-label="Menos">−</button>
              <output class="pm-qty-val">1</output>
              <button type="button" class="pm-qty-plus" aria-label="Más">+</button>
            </div>
            <button class="btn btn-solid pm-add" type="button">Agregar al pedido</button>
            <button class="pm-icon pm-fav" type="button" aria-pressed="false" aria-label="Agregar a favoritos">
              <svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>
            </button>
            <button class="pm-icon pm-share" type="button" aria-label="Compartir">
              <svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>
            </button>
          </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    ui = {
      sheet: dlg.querySelector('.pm-sheet'),
      stage: dlg.querySelector('.pm-stage'),
      img: dlg.querySelector('.pm-img'),
      cat: dlg.querySelector('.pm-cat'),
      title: dlg.querySelector('.pm-title'),
      desc: dlg.querySelector('.pm-desc'),
      sizesWrap: dlg.querySelector('.pm-sizes-wrap'),
      sizes: dlg.querySelector('.pm-sizes'),
      price: dlg.querySelector('.pm-price'),
      serves: dlg.querySelector('.pm-serves'),
      nav: dlg.querySelector('.pm-nav'),
      count: dlg.querySelector('.pm-count'),
      extra: dlg.querySelector('.pm-extra'),
      stock: dlg.querySelector('.pm-stock'),
      stars: dlg.querySelector('.pm-stars'),
      ratingNum: dlg.querySelector('.pm-rating-num'),
      ratingCount: dlg.querySelector('.pm-rating-count'),
      ratingHint: dlg.querySelector('.pm-rating-hint'),
    };

    dlg.querySelector('.pm-close').addEventListener('click', () => close());
    dlg.querySelector('.pm-prev').addEventListener('click', () => step(-1));
    dlg.querySelector('.pm-next').addEventListener('click', () => step(1));
    dlg.querySelector('.pm-share').addEventListener('click', share);
    const qtyOut = dlg.querySelector('.pm-qty-val');
    const setQty = (n) => { qty = Math.max(1, Math.min(20, n)); qtyOut.textContent = qty; };
    dlg.querySelector('.pm-qty-minus').addEventListener('click', () => setQty(qty - 1));
    dlg.querySelector('.pm-qty-plus').addEventListener('click', () => setQty(qty + 1));
    ui.setQty = setQty;
    dlg.querySelector('.pm-add').addEventListener('click', async (e) => {
      if (!hooks.onAdd) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await hooks.onAdd(current, current.sizes[sizeIdx], qty);
        btn.classList.remove('done'); void btn.offsetWidth; btn.classList.add('done');
        setQty(1);
      } finally { btn.disabled = false; }
    });
    dlg.querySelector('.pm-fav').addEventListener('click', async () => {
      if (!hooks.onToggleFavorite) return;
      const on = await hooks.onToggleFavorite(current);
      if (typeof on === 'boolean') paintFav(on);
    });

    // estrellas: al pasar el dedo/ratón se previsualiza; al tocar se califica
    ui.stars.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-star]'); if (b) paintStars(+b.dataset.star); });
    ui.stars.addEventListener('pointerleave', () => paintStars());
    ui.stars.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-star]');
      if (!b || !hooks.onRate) return;
      const p = current;
      const rating = await hooks.onRate(p, +b.dataset.star);
      if (rating && p === current && summary) { summary.rating = rating; paintRating(true); }
    });

    // clic en el fondo oscuro cierra
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    // Esc: usamos nuestra animación de cierre
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });

    ui.sizes.addEventListener('click', (e) => {
      const b = e.target.closest('[data-size]');
      if (b) selectSize(+b.dataset.size);
    });
    ui.sizes.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const n = current.sizes.length;
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      selectSize((sizeIdx + d + n) % n, true);
    });

    bindGestures();
  }

  /* ---------- pintar un producto ---------- */
  function render(p, dir = 0) {
    current = p;
    summary = null;
    ui.cat.textContent = p.cat;
    ui.title.textContent = p.name;
    ui.desc.textContent = p.full || p.desc;
    ui.img.alt = p.name;

    ui.sizesWrap.hidden = p.sizes.length < 2;
    ui.sizes.innerHTML = p.sizes.map((s, i) => `
      <button type="button" role="radio" data-size="${i}" aria-checked="false" tabindex="-1">
        <strong>${esc(s.label)}</strong>
        ${s.serves ? `<small>${esc(s.serves)}</small>` : ''}
      </button>`).join('');
    selectSize(0, false, dir);

    const i = group.indexOf(p.id);
    ui.nav.hidden = group.length < 2;
    ui.count.textContent = `${i + 1} / ${group.length}`;

    ui.setQty(1);
    paintActions();
    loadSummary(p);
  }

  // Botones que dependen de la tienda (con un enlace directo la ventana abre antes de configure())
  function paintActions() {
    dlg.querySelector('.pm-add').hidden = !hooks.onAdd;
    dlg.querySelector('.pm-qty').hidden = !hooks.onAdd;
    dlg.querySelector('.pm-fav').hidden = !hooks.onToggleFavorite;
    paintFav(Boolean(hooks.isFavorite?.(current)));
  }

  /* ---------- existencias y calificación ---------- */
  async function loadSummary(p) {
    ui.extra.hidden = !hooks.loadSummary;
    if (!hooks.loadSummary) return;
    summary = null;
    paintStock(); paintRating();
    try {
      const s = await hooks.loadSummary(p);
      if (p !== current) return;          // ya se cambió de producto
      summary = s;
    } catch { if (p !== current) return; summary = { failed: true }; }
    paintStock(); paintRating();
  }

  function paintStock() {
    const el = ui.stock;
    el.className = 'pm-stock';
    if (!summary) { el.textContent = 'Consultando existencias…'; el.classList.add('loading'); return; }
    if (summary.failed) { el.textContent = 'No pudimos consultar las existencias.'; return; }
    const st = summary.stock[current.sizes[sizeIdx].id];
    if (!st || !st.total) { el.innerHTML = '<span><strong>Agotado por ahora</strong> · pregunta en tu sucursal</span>'; el.classList.add('out'); return; }
    const where = st.branches === 1 ? '1 sucursal' : `${st.branches} sucursales`;
    el.innerHTML = `<span><strong>${st.total} disponible${st.total === 1 ? '' : 's'}</strong> en ${where}`
      + (st.here ? ` · ${st.here.qty ? `${st.here.qty} en ${esc(st.here.name)}` : `ninguno en ${esc(st.here.name)}`}` : '') + '</span>';
    el.classList.add(st.total <= 3 ? 'low' : 'ok');
  }

  // Sin `preview` las estrellas muestran el promedio (con fracción); con `preview` se llenan hasta esa
  function paintStars(preview = 0) {
    const r = summary?.rating;
    const value = preview || r?.avg || 0;
    [...ui.stars.children].forEach((b, i) => {
      b.style.setProperty('--fill', Math.max(0, Math.min(1, value - i)));
      b.setAttribute('aria-checked', String(r?.mine === i + 1));
    });
    ui.stars.classList.toggle('preview', Boolean(preview));
  }

  function paintRating(justRated = false) {
    const r = summary?.rating;
    ui.stars.parentElement.classList.toggle('loading', !r);
    paintStars();
    ui.ratingNum.textContent = r?.count ? r.avg.toFixed(1) : '';
    ui.ratingCount.textContent = r ? (r.count ? `(${r.count} calificaci${r.count === 1 ? 'ón' : 'ones'})` : 'Sin calificaciones aún') : '';
    ui.ratingHint.textContent = !r ? ''
      : r.mine ? `${justRated ? '¡Gracias! ' : ''}Tu calificación: ${r.mine} de 5 · toca otra estrella para cambiarla`
        : '¿Ya lo probaste? Toca las estrellas para calificarlo';
    if (justRated) { ui.stars.classList.remove('pop'); void ui.stars.offsetWidth; ui.stars.classList.add('pop'); }
  }

  function selectSize(i, focus = false, dir = 0) {
    sizeIdx = i;
    const s = current.sizes[i];
    [...ui.sizes.children].forEach((b, j) => {
      b.setAttribute('aria-checked', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
      if (j === i && focus) b.focus();
    });
    ui.price.textContent = money(s.price);
    ui.serves.textContent = [current.sizes.length > 1 ? s.label : '', s.serves].filter(Boolean).join(' · ');
    if (hooks.loadSummary) paintStock();
    swapImage(s.img || current.img, dir);
  }

  function swapImage(src, dir) {
    if (ui.img.getAttribute('src') === src) return;
    if (reduceMotion || !ui.img.getAttribute('src')) { ui.img.src = src; return; }
    ui.img.classList.remove('pm-in');
    ui.img.style.setProperty('--dir', dir || 0);
    ui.img.classList.add('pm-out');
    setTimeout(() => {
      ui.img.src = src;
      ui.img.classList.remove('pm-out');
      void ui.img.offsetWidth;
      ui.img.classList.add('pm-in');
    }, 170);
  }

  /* ---------- abrir / cerrar ---------- */
  function open(id, { origin = null, ids = null, fromHistory = false } = {}) {
    const p = products.get(id);
    if (!p) return;
    if (!dlg) build();

    group = ids || [...products.values()].filter((x) => x.cat === p.cat).map((x) => x.id);
    if (!group.includes(id)) group = [id];

    ui.img.removeAttribute('src');
    render(p);

    if (!dlg.open) {
      document.documentElement.classList.add('pm-lock');
      dlg.classList.remove('pm-closing');
      dlg.showModal();
      ui.sheet.scrollTop = 0;
      if (origin && !reduceMotion) flyFrom(origin);
    }
    if (!fromHistory) {
      const target = HASH + id;
      if (location.hash !== target) {
        if (pushedHistory) history.replaceState({ pm: id }, '', target);
        else { history.pushState({ pm: id }, '', target); pushedHistory = true; }
      }
    }
  }

  function close({ fromHistory = false } = {}) {
    return new Promise((resolve) => {
      if (!dlg?.open) return resolve();
      const finish = () => {
        dlg.classList.remove('pm-closing');
        ui.sheet.style.transform = '';
        dlg.close();
        document.documentElement.classList.remove('pm-lock');
        resolve();
      };
      if (!fromHistory && pushedHistory) { pushedHistory = false; history.back(); }
      else if (!fromHistory && location.hash.startsWith(HASH)) history.replaceState(null, '', location.pathname + location.search);
      if (reduceMotion) return finish();
      dlg.classList.add('pm-closing');
      setTimeout(finish, 260);
    });
  }

  function step(d) {
    if (group.length < 2) return;
    const i = (group.indexOf(current.id) + d + group.length) % group.length;
    render(products.get(group[i]), d);
    if (pushedHistory) history.replaceState({ pm: group[i] }, '', HASH + group[i]);
  }

  /* la foto "vuela" desde la tarjeta hasta la ventana */
  function flyFrom(originImg) {
    const from = originImg.getBoundingClientRect();
    if (!from.width || from.bottom < 0 || from.top > innerHeight) return;
    requestAnimationFrame(() => {
      const to = ui.img.getBoundingClientRect();
      if (!to.width) return;
      const ghost = originImg.cloneNode();
      ghost.className = 'pm-ghost';
      Object.assign(ghost.style, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' });
      dlg.appendChild(ghost);
      ui.img.style.opacity = '0';
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const k = from.width / to.width;
      ghost.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(-8deg)` }, { transform: 'none' }],
        { duration: 520, easing: 'cubic-bezier(.2, .8, .2, 1)' }
      ).finished.then(() => { ui.img.style.opacity = ''; ghost.remove(); });
    });
  }

  /* ---------- compartir ---------- */
  async function share() {
    const url = location.href.split('#')[0] + HASH + current.id;
    const text = `${current.name} — Pastelerías Miky`;
    if (navigator.share) {
      try { await navigator.share({ title: text, text, url }); } catch { /* cancelado */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank', 'noopener');
    }
  }

  /* ---------- gestos: deslizar para cerrar (móvil) y para cambiar ---------- */
  function bindGestures() {
    let x0 = 0, y0 = 0, t0 = 0, mode = null, dy = 0;
    const isSheet = () => matchMedia('(max-width: 820px)').matches;

    ui.sheet.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('button, a')) return;
      x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); mode = null; dy = 0;
    });
    ui.sheet.addEventListener('pointermove', (e) => {
      if (!t0) return;
      const dx = e.clientX - x0; dy = e.clientY - y0;
      if (!mode && Math.hypot(dx, dy) > 10) {
        if (Math.abs(dy) > Math.abs(dx) && dy > 0 && isSheet() && ui.sheet.scrollTop <= 0) mode = 'close';
        else if (Math.abs(dx) > Math.abs(dy) && e.target.closest('.pm-stage')) mode = 'swipe';
        else { t0 = 0; return; }
      }
      if (mode === 'close') ui.sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    });
    const end = (e) => {
      if (!t0) return;
      const dx = e.clientX - x0;
      const fast = Date.now() - t0 < 250;
      if (mode === 'close') {
        ui.sheet.style.transition = 'transform .25s';
        if (dy > 130 || (fast && dy > 40)) close();
        else ui.sheet.style.transform = '';
        setTimeout(() => { ui.sheet.style.transition = ''; }, 260);
      } else if (mode === 'swipe' && Math.abs(dx) > 50) {
        step(dx < 0 ? 1 : -1);
      }
      t0 = 0; mode = null;
    };
    ui.sheet.addEventListener('pointerup', end);
    ui.sheet.addEventListener('pointercancel', end);
  }

  /* ---------- enlaces globales ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-product]');
    if (!t || t.closest('.pm')) return;
    e.preventDefault();
    const ids = t.dataset.productGroup ? t.dataset.productGroup.split(',') : null;
    open(t.dataset.product, { origin: t.querySelector('img'), ids });
  });

  addEventListener('popstate', () => {
    if (location.hash.startsWith(HASH)) { pushedHistory = false; open(decodeURIComponent(location.hash.slice(HASH.length)), { fromHistory: true }); }
    else if (dlg?.open && !dlg.classList.contains('pm-closing')) { pushedHistory = false; close({ fromHistory: true }); }
  });

  function register(items) {
    items.forEach((p) => products.set(p.id, p));
    // enlace directo: index.html#producto/red-velvet
    if (location.hash.startsWith(HASH) && !dlg?.open) {
      const id = decodeURIComponent(location.hash.slice(HASH.length));
      if (products.has(id)) open(id, { fromHistory: true });
    }
  }

  function paintFav(on) {
    const b = dlg.querySelector('.pm-fav');
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Agregar a favoritos');
    if (on) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  }

  /** Conecta las acciones de la tienda (carrito y favoritos). */
  function configure(h) { hooks = { ...hooks, ...h }; }

  /** Vuelve a pintar el corazón y la calificación propia (p. ej. al iniciar o cerrar sesión). */
  function refresh() {
    if (!dlg?.open || !current) return;
    paintActions();
    loadSummary(current);
  }

  return { register, configure, refresh, open, close, get: (id) => products.get(id) };
})();
