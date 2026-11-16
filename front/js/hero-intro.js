/* Portada: al abrir la página la tartaleta se arma.
   Las rebanadas de durazno llegan desde fuera y se unen; luego caen el centro (piña y kiwi),
   la uva y al final la cereza. Todas las piezas son recortes de la misma foto, así que al
   terminar se cambian por la imagen real sin que se note.
   Conforme llega cada ingrediente aparece su recuadro con una línea hasta donde está en la
   tartaleta; ya que están todos se quedan HOLD ms y se van (también se ocultan al bajar, porque
   la foto gira con el scroll).
   Las coordenadas son de img/hero-tartaleta.webp (1000×929). Si el equipo cambia la imagen
   desde el panel no hay animación ni recuadros; con menos movimiento salen los recuadros fijos. */
const SRC = 'img/hero-tartaleta.webp';
const W = 1000, H = 929;
const C = { x: 500, y: 465 };            // centro del plato
const SLICES = 14;                        // rebanadas, una por cada gajo de durazno
const R_IN = 205, R_OUT = 700;            // anillo de duraznos (R_OUT cubre las esquinas)
const SLOW = 1.6;                         // escala de todos los tiempos de la animación
const HOLD = 3000;                        // cuánto se quedan los recuadros ya completos

/* Ingredientes (de la descripción del catálogo): `at` es el punto en la foto, `crop` el recorte
   para la miniatura [imagen, ancho, alto, centro x, centro y, radio], `t` cuándo aparece (ms sin
   escalar), `x` / `m` la esquina del recuadro en % de la portada, en computadora y en celular, y
   `side: true` hace que la línea salga del costado del recuadro (para no cruzar el texto). */
const LABELS = [
  { name: 'Costra de almendra', at: [128, 548], crop: ['img/tartaleta.webp', 400, 500, 122, 302, 36], t: 700, x: [-21, -14], m: [-6, 20], side: true },
  { name: 'Durazno', at: [800, 350], crop: [SRC, W, H, 800, 350, 95], t: 1300, x: [103, 12], m: [84, 17] },
  { name: 'Piña', at: [470, 312], crop: [SRC, W, H, 470, 312, 45], t: 1700, x: [22, -22], m: [16, -14] },
  { name: 'Kiwi', at: [640, 450], crop: [SRC, W, H, 390, 420, 55], t: 1850, x: [103, 52], m: [84, 42] },
  { name: 'Uva', at: [547, 395], crop: [SRC, W, H, 547, 395, 62], t: 2250, x: [58, -22], m: [60, -14] },
  { name: 'Cereza', at: [493, 482], crop: [SRC, W, H, 493, 500, 62], t: 2700, x: [86, 90], m: [84, 67], side: true },
];

const art = document.querySelector('.hero-art');
const main = art?.querySelector('.hero-main');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const pct = (x, y) => `${(x / W * 100).toFixed(2)}% ${(y / H * 100).toFixed(2)}%`;
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const circle = (cx, cy, r, from = 0, to = Math.PI * 2, n = 28) =>
  Array.from({ length: n + 1 }, (_, i) => pt(cx, cy, r, from + (to - from) * i / n));
const poly = (pts) => `polygon(${pts.map(([x, y]) => pct(x, y)).join(',')})`;


// Con «evenodd» cada figura después de la primera es un hueco (el centro deja libres la uva y la cereza)
const holes = (outer, ...inner) => `polygon(evenodd,${[outer, ...inner.map((h) => [...h, h[0], outer[0]])]
  .flat().map(([x, y]) => pct(x, y)).join(',')})`;

const GRAPE = { x: 547, y: 395, r: 60 };
const CHERRY = { x: 493, y: 482, r: 44 };
// Cereza con su rabito: la bolita sin el gajo de abajo y el tallo, que termina sobre un durazno
const cherry = [
  ...circle(CHERRY.x, CHERRY.y, CHERRY.r, Math.PI * 0.64, Math.PI * 2.36, 24),
  [500, 528], [497, 560], [490, 600], [486, 630], [480, 660], [477, 680], [472, 694],
  [452, 692], [460, 668], [468, 640], [474, 610], [477, 580], [482, 550], [476, 526],
];
// Punta del rabito que cae dentro del anillo de duraznos (más allá de R_IN)
const stemTip = [[479, 670], [472, 696], [450, 694], [460, 670]];
const STEM_TIP = Math.atan2(692 - C.y, 462 - C.x);
const grape = circle(GRAPE.x, GRAPE.y, GRAPE.r);
// El hueco del centro sólo llega hasta su borde (lo de más allá ya lo deja la rebanada)
const cherryCore = [...cherry.slice(0, -14), [500, 528], [497, 560], [490, 600], [486, 630], [479, 666],
  [461, 666], [468, 640], [474, 610], [477, 580], [482, 550], [476, 526]];

// La rebanada donde termina el rabito lo deja hueco: la punta llega con la cereza
function slice(i) {
  const a0 = (i / SLICES) * Math.PI * 2 - Math.PI / 2, a1 = a0 + Math.PI * 2 / SLICES;
  const pts = [...circle(C.x, C.y, R_OUT, a0, a1, 6), ...circle(C.x, C.y, R_IN, a1, a0, 6)];
  const tip = (STEM_TIP - a0 + Math.PI * 4) % (Math.PI * 2);
  return tip < a1 - a0 ? holes([...pts, pts[0]], stemTip) : poly(pts);
}

function piece(clip, cls, [ox, oy]) {
  const img = document.createElement('img');
  img.src = SRC; img.alt = ''; img.className = `build-piece ${cls}`;
  img.style.clipPath = clip;
  img.style.transformOrigin = pct(ox, oy);   // gira y escala sobre su propio centro
  return img;
}

// Bajo los huecos del centro va otro trozo de la misma foto (kiwi y piña de al lado), recorrido
// FILL px, para que mientras caen la uva y la cereza se vea tartaleta y no el plato vacío
const FILL = { x: 98, y: 52 };
const shift = (pts) => pts.map(([x, y]) => [x - FILL.x, y - FILL.y]);
function filler(pts) {
  const img = piece(poly(shift(pts)), 'fill', [0, 0]);
  img.style.translate = `${FILL.x / W * 100}% ${FILL.y / H * 100}%`;
  return img;
}

function done() { art.classList.add('built'); }

/* ---------- Recuadros de ingredientes ---------- */
const SVG = 'http://www.w3.org/2000/svg';

function labels() {
  const wrap = document.createElement('div');
  wrap.className = 'ingredients';
  wrap.setAttribute('aria-label', 'Ingredientes de la tartaleta');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  wrap.append(svg);

  const items = LABELS.map((l, i) => {
    const [src, w, h, cx, cy, r] = l.crop;
    const box = document.createElement('figure');
    box.className = 'ingredient';
    box.style.cssText = `--x:${l.x[0]}%;--y:${l.x[1]}%;--mx:${l.m[0]}%;--my:${l.m[1]}%`;
    const thumb = document.createElement('span');
    thumb.className = 'ingredient-img';
    Object.assign(thumb.style, {
      backgroundImage: `url(${src})`,
      backgroundSize: `${(w / (2 * r) * 100).toFixed(1)}% auto`,
      backgroundPosition: `${((cx - r) / (w - 2 * r) * 100).toFixed(1)}% ${((cy - r) / (h - 2 * r) * 100).toFixed(1)}%`,
    });
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span><span>${l.name}</span>`;
    box.append(thumb, cap);
    const path = document.createElementNS(SVG, 'path');
    const mark = document.createElementNS(SVG, 'rect');
    svg.append(path, mark);
    wrap.append(box);
    return { ...l, box, path, mark, shown: false };
  });
  art.append(wrap);

  // Codo como en un plano: del centro del recuadro baja (o sube) hasta la altura del punto y
  // luego va de lado; si el punto queda a la altura del recuadro (o `side`), sale del costado.
  function place(it) {
    const s = main.offsetWidth / W < main.offsetHeight / H ? main.offsetWidth / W : main.offsetHeight / H;
    const px = main.offsetLeft + (main.offsetWidth - W * s) / 2 + it.at[0] * s;
    const py = main.offsetTop + (main.offsetHeight - H * s) / 2 + it.at[1] * s;
    const b = { l: it.box.offsetLeft, t: it.box.offsetTop, w: it.box.offsetWidth, h: it.box.offsetHeight };
    let d;
    if (!it.side && (py > b.t + b.h || py < b.t)) {
      const bx = b.l + b.w / 2, by = py > b.t ? b.t + b.h : b.t;
      d = `M${bx},${by}V${py}H${px}`;
    } else {
      const bx = px < b.l ? b.l : b.l + b.w, by = b.t + b.h / 2;
      d = `M${bx},${by}H${px}V${py}`;
    }
    it.path.setAttribute('d', d);
    const m = 8;
    Object.entries({ x: px - m / 2, y: py - m / 2, width: m, height: m }).forEach(([k, v]) => it.mark.setAttribute(k, v));
  }
  const layout = () => items.forEach(place);
  addEventListener('resize', layout);

  function show(it, animate = true) {
    place(it);
    it.shown = true;
    it.box.classList.add('in');
    it.path.classList.add('in');
    it.mark.classList.add('in');
    if (!animate) return;
    const len = it.path.getTotalLength();
    it.path.style.strokeDasharray = len;
    // la línea nace en el ingrediente y llega al recuadro
    it.path.animate([{ strokeDashoffset: -len }, { strokeDashoffset: 0 }],
      { duration: 500 * SLOW, easing: 'ease-out', fill: 'backwards' });
    it.mark.animate([{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'none' }],
      { duration: 250 * SLOW, easing: 'ease-out', fill: 'backwards' });
    it.box.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 400 * SLOW, delay: 300 * SLOW, easing: 'ease-out', fill: 'backwards' });
  }

  // La foto gira al bajar: los recuadros sólo se ven arriba
  const onScroll = () => art.classList.toggle('labels-off', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  art.classList.add('labeled');
  // Si el panel cambia la foto, los puntos ya no cuadran
  const watch = new MutationObserver(() => api.remove());
  watch.observe(main, { attributes: true, attributeFilter: ['src'] });

  const api = {
    items,
    timers: [],
    play() {
      this.timers = items.map((it) => setTimeout(() => show(it), it.t * SLOW));
      // el último recuadro termina de entrar 700 ms (sin escalar) después de su turno
      this.leave(Math.max(...items.map((it) => it.t)) * SLOW + 700 * SLOW + HOLD);
    },
    all() { items.forEach((it) => !it.shown && show(it, false)); this.leave(HOLD); },
    leave(ms) {
      this.timers.push(setTimeout(() => wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' })
        .finished.then(() => api.remove()), ms));
    },
    remove() {
      this.timers.forEach(clearTimeout); watch.disconnect(); wrap.remove();
      art.classList.remove('labeled', 'labels-off');
      removeEventListener('resize', layout); removeEventListener('scroll', onScroll);
    },
  };
  return api;
}

async function build() {
  const stage = document.createElement('div');
  stage.className = 'build-stage';
  stage.setAttribute('aria-hidden', 'true');

  const slices = Array.from({ length: SLICES }, (_, i) => piece(slice(i), 'slice', [C.x, C.y]));
  const center = document.createElement('div');
  center.className = 'build-piece';
  center.style.transformOrigin = pct(500, 450);
  center.append(
    filler(circle(GRAPE.x, GRAPE.y, GRAPE.r + 6)),
    filler([...circle(CHERRY.x, CHERRY.y, CHERRY.r + 6, Math.PI * 0.6, Math.PI * 2.4, 24),
      [506, 528], [503, 560], [496, 600], [492, 630], [486, 660], [483, 680], [478, 700],
      [446, 698], [454, 668], [462, 640], [468, 610], [471, 580], [476, 550], [470, 526]]),
    piece(holes(circle(500, 450, 222, 0, Math.PI * 2, 48), grape, cherryCore), 'center', [500, 450]));
  const gr = piece(poly(grape), 'grape', [GRAPE.x, GRAPE.y]);
  const cher = piece(poly(cherry), 'cherry', [CHERRY.x, CHERRY.y]);
  stage.append(...slices, center, gr, cher);

  await slices[0].decode();
  art.append(stage);
  art.classList.add('building');
  // Recuadros de ingredientes ocultos por ahora:
  // const tags = labels();
  // tags.play();

  // Si el panel cambia la foto a media animación, se corta y queda la nueva
  const watch = new MutationObserver(() => finish(true));
  watch.observe(main, { attributes: true, attributeFilter: ['src'] });

  const ease = 'cubic-bezier(.2, .9, .25, 1.12)';
  const anims = slices.map((el, i) => {
    const a = ((i + 0.5) / SLICES) * Math.PI * 2 - Math.PI / 2;
    const d = 70 + (i % 3) * 14;
    const turn = (i % 2 ? 1 : -1) * (24 + (i % 4) * 9);
    return el.animate([
      { transform: `translate(${(Math.cos(a) * d).toFixed(1)}%, ${(Math.sin(a) * d).toFixed(1)}%) rotate(${turn}deg) scale(.7)`, opacity: 0 },
      { opacity: 1, offset: 0.35 },
      { transform: 'none', opacity: 1 },
    ], { duration: 950 * SLOW, delay: (120 + i * 55) * SLOW, easing: ease, fill: 'backwards' });
  });
  anims.push(
    center.animate([
      { transform: 'scale(1.7) rotate(-90deg)', opacity: 0 },
      { opacity: 1, offset: 0.4 },
      { transform: 'none', opacity: 1 },
    ], { duration: 800 * SLOW, delay: 1050 * SLOW, easing: ease, fill: 'backwards' }),
    gr.animate([
      { transform: 'translateY(-90%) scale(1.8)', opacity: 0 },
      { opacity: 1, offset: 0.3 },
      { transform: 'translateY(0) scale(.92, 1.08)', offset: 0.75 },
      { transform: 'none', opacity: 1 },
    ], { duration: 650 * SLOW, delay: 1600 * SLOW, easing: 'cubic-bezier(.4, 0, .3, 1)', fill: 'backwards' }),
    cher.animate([
      { transform: 'translateY(-110%) rotate(-25deg) scale(1.8)', opacity: 0 },
      { opacity: 1, offset: 0.3 },
      { transform: 'translateY(0) rotate(4deg) scale(1.1, .9)', offset: 0.7 },
      { transform: 'translateY(-1.5%) rotate(-2deg)', offset: 0.85 },
      { transform: 'none', opacity: 1 },
    ], { duration: 800 * SLOW, delay: 1900 * SLOW, easing: 'cubic-bezier(.4, 0, .3, 1)', fill: 'backwards' }),
  );

  let ended = false;
  function finish(abort = false) {
    if (ended) return;
    ended = true;
    watch.disconnect();
    if (abort) { anims.forEach((a) => a.cancel()); /* tags.remove(); */ }
    art.classList.remove('building');
    done();
    // La foto real ya está debajo con los mismos píxeles: se quitan las piezas
    stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: abort ? 0 : 250, fill: 'forwards' })
      .finished.then(() => stage.remove());
  }
  Promise.all(anims.map((a) => a.finished)).then(() => finish(), () => {});
}

if (art && main) {
  const isDefault = main.getAttribute('src') === SRC;
  if (!isDefault || !('animate' in Element.prototype)) done();
  else if (reduce) done(); // { done(); labels().all(); } — recuadros ocultos por ahora
  // espera a que se vaya el splash de index.html
  else (window.mikySplash || Promise.resolve()).then(build).catch(done);
}
