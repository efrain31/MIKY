/* Cliente del API de Miky: un solo lugar para hablar con el back.
   Todas las peticiones que cambian datos llevan X-Requested-With (protección CSRF del back). */

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'miky' } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, opts);
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || 'Algo salió mal. Intenta de nuevo.', data?.details);
  return data;
}

const get = (u) => request('GET', u);
const send = (m) => (u, b = {}) => request(m, u, b);
const post = send('POST'), put = send('PUT'), patch = send('PATCH'), del = send('DELETE');

export const api = {
  // Público
  catalog: () => get('/catalog'),
  branches: () => get('/branches'),
  stock: (branchId) => get(`/branches/${branchId}/stock`),
  productSummary: (productId) => get(`/products/${productId}/summary`),
  content: () => get('/content'),

  // Cuenta
  me: () => get('/auth/me'),
  login: (email, password) => post('/auth/login', { email, password }),
  register: (data) => post('/auth/register', data),
  logout: () => post('/auth/logout'),
  updateMe: (data) => patch('/me', data),
  changePassword: (current, next) => post('/me/password', { current, next }),

  favorites: () => get('/me/favorites'),
  addFavorite: (productId) => put(`/me/favorites/${productId}`),
  removeFavorite: (productId) => del(`/me/favorites/${productId}`),
  rate: (productId, stars) => put(`/me/ratings/${productId}`, { stars }),

  cart: () => get('/me/cart'),
  setCartItem: (variantId, quantity) => put(`/me/cart/${variantId}`, { quantity }),
  mergeCart: (items) => post('/me/cart/merge', { items }),

  createOrder: (data) => post('/orders', data),
  myOrders: () => get('/me/orders'),
  order: (folio) => get(`/orders/${encodeURIComponent(folio)}`),
  cancelOrder: (folio) => post(`/orders/${encodeURIComponent(folio)}/cancel`),

  // Personal
  staffMeta: () => get('/staff/meta'),
  staffOrders: (params = '') => get(`/staff/orders${params}`),
  staffOrder: (id) => get(`/staff/orders/${id}`),
  setOrderStatus: (id, status, note, paymentMethod) => patch(`/staff/orders/${id}/status`, { status, note, paymentMethod }),

  // Ventas (registro con desglose de IVA)
  salesSummary: (qs) => get(`/staff/sales/summary?${qs}`),
  sales: (qs) => get(`/staff/sales?${qs}`),
  sale: (id) => get(`/staff/sales/${id}`),
  createSale: (data) => post('/staff/sales', data),
  annulSale: (id, reason, restock) => post(`/staff/sales/${id}/annul`, { reason, restock }),
  staffBranches: () => get('/staff/branches'),
  inventory: (branchId) => get(`/staff/inventory?branch=${branchId}`),
  adjustInventory: (data) => post('/staff/inventory/adjust', data),
  movements: (branchId) => get(`/staff/inventory/movements?branch=${branchId}`),
  productImage: (productId, file) => { const f = new FormData(); f.append('image', file); return post(`/staff/products/${productId}/image`, f); },

  // Contenido del sitio (admin y supervisor)
  saveText: (key, value) => put(`/admin/content/${encodeURIComponent(key)}`, { value }),
  uploadImage: (key, file) => { const f = new FormData(); f.append('image', file); return post(`/admin/content/${encodeURIComponent(key)}/image`, f); },
  resetContent: (key) => del(`/admin/content/${encodeURIComponent(key)}`),

  // Usuarios (admin)
  users: (q = '') => get(`/admin/users${q}`),
  createUser: (data) => post('/admin/users', data),
  updateUser: (id, data) => patch(`/admin/users/${id}`, data),
  resetPassword: (id, password) => post(`/admin/users/${id}/password`, { password }),
};

/* ---------- Sesión compartida entre módulos ---------- */
export const session = {
  user: null,
  listeners: new Set(),
  set(user) {
    this.user = user;
    this.listeners.forEach((fn) => fn(user));
  },
  onChange(fn) { this.listeners.add(fn); },
};

export const money = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Avisos breves (toast) ----------
   Van en la «capa superior» del navegador (popover) para quedar encima de cualquier ventana
   (<dialog>), que también vive ahí; cada aviso nuevo vuelve a subir la capa al frente. */
let toastBox;
export function toast(message, type = 'ok', ms = 3200) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    toastBox.setAttribute('aria-live', 'polite');
    if ('popover' in HTMLElement.prototype) toastBox.popover = 'manual';
    document.body.appendChild(toastBox);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  toastBox.appendChild(t);
  bringToFront();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => {
      t.remove();
      if (!toastBox.children.length && toastBox.popover) { try { toastBox.hidePopover(); } catch { /* ya oculto */ } }
    }, 300);
  }, ms);
}

function bringToFront() {
  if (!toastBox.popover) return;
  try {
    if (toastBox.matches(':popover-open')) toastBox.hidePopover();
    toastBox.showPopover();
  } catch { /* navegador sin popover: queda con z-index */ }
}

// Si se abre una ventana mientras hay avisos visibles, los subimos otra vez encima de ella
new MutationObserver(() => { if (toastBox?.children.length) bringToFront(); })
  .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
