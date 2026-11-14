import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { badRequest } from './errors.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

/** Sólo imágenes, máximo 6 MB, con nombre aleatorio (nunca el que manda el usuario). */
export const imageUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(badRequest('Sube una imagen JPG, PNG, WEBP o AVIF.'))),
}).single('image');

/** Comprueba la "firma" real del archivo para no aceptar algo disfrazado de imagen. */
export function looksLikeImage(path) {
  const b = Buffer.alloc(16);
  const fd = fs.openSync(path, 'r');
  fs.readSync(fd, b, 0, 16, 0);
  fs.closeSync(fd);
  const hex = b.toString('hex');
  return hex.startsWith('ffd8ff')                               // JPG
    || hex.startsWith('89504e47')                               // PNG
    || (hex.startsWith('52494646') && b.toString('ascii', 8, 12) === 'WEBP')
    || b.toString('ascii', 4, 12).startsWith('ftypavi');        // AVIF
}

export const publicPath = (filename) => `/uploads/${filename}`;
