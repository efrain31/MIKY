import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './db.js';
import { unauthorized, forbidden } from './errors.js';

const scrypt = promisify(crypto.scrypt);

/* ---------- Contraseñas: scrypt con sal aleatoria (nunca se guarda la contraseña) ---------- */
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(plain.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(plain, stored) {
  const [alg, n, r, p, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = await scrypt(plain.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(expected, got);
}

export function checkPasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (pw.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(pw) || !/\d/.test(pw)) return 'Usa letras y al menos un número.';
  return null;
}

/* ---------- Sesiones: token aleatorio en cookie httpOnly; en BD sólo su sha256 ---------- */
export const COOKIE = 'miky_sid';
const SESSION_DAYS = 14;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

export async function createSession(res, userId, userAgent) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await query('INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1, $2, $3, $4)',
    [sha256(token), userId, expires, (userAgent || '').slice(0, 300)]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    expires,
    path: '/',
  });
}

export async function destroySession(req, res) {
  const token = req.cookies[COOKIE];
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

/** Lee la cookie y deja req.user (o null). Nunca lanza. */
export async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies[COOKIE];
  if (token) {
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.branch_id, b.name AS branch_name
         FROM sessions s JOIN users u ON u.id = s.user_id
         LEFT JOIN branches b ON b.id = u.branch_id
        WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
      [sha256(token)]);
    req.user = rows[0] || null;
  }
  next();
}

export const STAFF = ['ventas', 'produccion', 'supervisor', 'admin'];
export const EDITORS = ['supervisor', 'admin'];

export function requireUser(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

/* ---------- Límite de intentos de inicio de sesión (en memoria) ---------- */
const attempts = new Map();
export function loginRateLimit(req, _res, next) {
  const key = `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, until: 0, first: now };
  if (a.until > now) {
    const min = Math.ceil((a.until - now) / 60000);
    return next(Object.assign(new Error(`Demasiados intentos. Intenta de nuevo en ${min} min.`), { status: 429 }));
  }
  req.loginAttempt = {
    fail() {
      if (now - a.first > 15 * 60000) { a.n = 0; a.first = now; }
      a.n += 1;
      if (a.n >= 5) { a.until = now + 15 * 60000; a.n = 0; }
      attempts.set(key, a);
    },
    ok() { attempts.delete(key); },
  };
  next();
}

/* ---------- Cookies sin dependencia extra ---------- */
export function parseCookies(req, _res, next) {
  req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=');
    return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }).filter(([k]) => k));
  next();
}

/** Protección CSRF simple: toda petición que modifica datos debe traer este encabezado
 *  (un formulario de otro sitio no puede ponerlo) y venir del mismo origen. */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'miky') return next(forbidden('Solicitud no permitida.'));
  next();
}
