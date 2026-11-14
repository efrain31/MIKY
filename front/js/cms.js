/* Edición del sitio en vivo (sólo admin y supervisor).
   - Textos:   cualquier elemento con data-cms="clave"      → se edita en su lugar y se guarda al salir.
   - Imágenes: cualquier <img> con data-cms-img="clave"      → botón «Cambiar imagen».
   Lo que no se ha editado sale tal cual del HTML; la BD sólo guarda los cambios. */
import { api, session, toast } from './api.js';

const textEls = () => [...document.querySelectorAll('[data-cms]')];
const imgEls = () => [...document.querySelectorAll('img[data-cms-img]')];
let bar;

export async function initCms() {
  // 1) Aplica lo que el equipo ya cambió
  try {
    const content = await api.content();
    textEls().forEach((el) => { const c = content[el.dataset.cms]; if (c?.kind === 'text') el.innerText = c.value; });
    imgEls().forEach((el) => {
      const c = content[el.dataset.cmsImg];
      if (c?.kind === 'image') { el.src = c.value; el.removeAttribute('srcset'); }
    });
  } catch { /* sin contenido editado: se queda el del HTML */ }

  // 2) Modo edición
  window.addEventListener('cms:toggle', () => (document.body.classList.contains('cms-editing') ? stop() : start()));
  window.addEventListener('cms:off', stop);
  if (new URLSearchParams(location.search).has('editar')) {
    const wait = () => (session.user ? (session.user.canEditSite && start()) : setTimeout(wait, 300));
    setTimeout(wait, 300);
  }
}

function start() {
  if (!session.user?.canEditSite) return toast('Tu rol no puede editar el sitio.', 'error');
  document.body.classList.add('cms-editing');

  textEls().forEach((el) => {
    el.contentEditable = 'plaintext-only';
    el.spellcheck = true;
    el.dataset.before = el.innerText;
    el.addEventListener('blur', saveText);
    el.addEventListener('keydown', keys);
  });

  imgEls().forEach((img) => {
    const host = img.parentElement;
    if (host.querySelector(`.cms-img-btn[data-for="${img.dataset.cmsImg}"]`)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cms-img-btn';
    btn.dataset.for = img.dataset.cmsImg;
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Cambiar imagen';
    btn.addEventListener('click', () => pickImage(img));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(btn);
  });

  bar = document.createElement('div');
  bar.className = 'cms-bar';
  bar.innerHTML = `
    <span><b>Modo edición</b> · toca un texto para cambiarlo; se guarda al salir de él.</span>
    <button type="button" class="btn btn-solid">Terminar</button>`;
  bar.querySelector('button').addEventListener('click', stop);
  document.body.appendChild(bar);
  toast('Modo edición activado.');
}

function stop() {
  if (!document.body.classList.contains('cms-editing')) return;
  document.activeElement?.blur();
  document.body.classList.remove('cms-editing');
  textEls().forEach((el) => {
    el.removeAttribute('contenteditable');
    el.removeEventListener('blur', saveText);
    el.removeEventListener('keydown', keys);
  });
  document.querySelectorAll('.cms-img-btn').forEach((b) => b.remove());
  bar?.remove();
}

function keys(e) {
  // Esc deshace lo que no se ha guardado; Enter guarda (en el título principal Enter hace salto de línea)
  if (e.key === 'Escape') { e.target.innerText = e.target.dataset.before; e.target.blur(); }
  if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'H1') { e.preventDefault(); e.target.blur(); }
}

async function saveText(e) {
  const el = e.target;
  const value = el.innerText.trim();
  if (value === el.dataset.before) return;
  if (!value) { el.innerText = el.dataset.before; return toast('El texto no puede quedar vacío.', 'error'); }
  el.classList.add('cms-saving');
  try {
    await api.saveText(el.dataset.cms, value);
    el.dataset.before = value;
    // si el mismo texto aparece en otro lugar (p. ej. el lema), se actualiza también
    textEls().filter((x) => x !== el && x.dataset.cms === el.dataset.cms).forEach((x) => { x.innerText = value; });
    toast('Texto guardado.');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    el.classList.remove('cms-saving');
  }
}

function pickImage(img) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/avif';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) return toast('La imagen pesa más de 6 MB.', 'error');
    img.classList.add('cms-saving');
    try {
      const res = await api.uploadImage(img.dataset.cmsImg, file);
      document.querySelectorAll(`img[data-cms-img="${img.dataset.cmsImg}"]`).forEach((x) => { x.src = res.value; x.removeAttribute('srcset'); });
      toast('Imagen actualizada.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      img.classList.remove('cms-saving');
    }
  });
  input.click();
}
