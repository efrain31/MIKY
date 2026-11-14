/** Error con código HTTP y mensaje pensado para mostrarse al usuario. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Inicia sesión para continuar.') => new HttpError(401, msg);
export const forbidden = (msg = 'No tienes permiso para esta acción.') => new HttpError(403, msg);
export const notFound = (msg = 'No encontrado.') => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, details);

// Validadores pequeños para no depender de librerías
export function str(v, { name, min = 1, max = 500, optional = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return null;
    throw badRequest(`Falta ${name}.`);
  }
  if (typeof v !== 'string') throw badRequest(`${name} no es válido.`);
  const s = v.trim();
  if (s.length < min) throw badRequest(`${name} es demasiado corto.`);
  if (s.length > max) throw badRequest(`${name} es demasiado largo.`);
  return s;
}

export function int(v, { name, min = -Infinity, max = Infinity } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${name} no es válido.`);
  return n;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
