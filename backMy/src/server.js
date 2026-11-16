import express from 'express';
import { query, waitForDb } from './db.js';
import { parseCookies, loadUser, csrfGuard, hashPassword, checkPasswordStrength } from './auth.js';
import { UPLOAD_DIR } from './uploads.js';
import publicRoutes from './routes/public.js';
import accountRoutes from './routes/account.js';
import staffRoutes from './routes/staff.js';
import { content, users } from './routes/admin.js';
import salesRoutes from './routes/sales.js';
import reportRoutes from './routes/reports.js';
import { migrate } from './migrate.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);   // detrás de nginx

app.use(express.json({ limit: '100kb' }));
app.use(parseCookies);
app.use('/api', csrfGuard, loadUser);

app.get('/api/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api', publicRoutes);
app.use('/api', accountRoutes);
app.use('/api/staff/sales', salesRoutes);
app.use('/api/staff/reports', reportRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/admin/content', content);
app.use('/api/admin/users', users);

// En Docker nginx sirve /uploads; esto es para correr el back solo en desarrollo.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Errores: mensajes claros para el usuario; el detalle técnico sólo al log
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  const message = status >= 500 ? 'Ocurrió un error en el servidor. Intenta de nuevo.'
    : err.code === 'LIMIT_FILE_SIZE' ? 'La imagen pesa más de 6 MB.' : err.message;
  res.status(status).json({ error: message, ...(err.details ? { details: err.details } : {}) });
});

/** Crea el primer admin con ADMIN_EMAIL / ADMIN_PASSWORD si todavía no hay ninguno. */
async function ensureAdmin() {
  const { rowCount } = await query(`SELECT 1 FROM users WHERE role = 'admin' AND active`);
  if (rowCount) return;
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || checkPasswordStrength(password)) {
    console.warn('⚠️  No hay admin: define ADMIN_EMAIL y ADMIN_PASSWORD (8+ caracteres, letras y números) en .env');
    return;
  }
  await query(
    `INSERT INTO users (email, name, role, password_hash) VALUES ($1, 'Administrador', 'admin', $2)
     ON CONFLICT (email) DO UPDATE SET role = 'admin', active = true`,
    [email, await hashPassword(password)]);
  console.log(`✔ Admin inicial creado: ${email}`);
}

const PORT = Number(process.env.PORT || 3000);
await waitForDb();
await migrate();
await ensureAdmin();
setInterval(() => query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {}), 3600e3);
app.listen(PORT, () => console.log(`API de Miky escuchando en :${PORT}`));
