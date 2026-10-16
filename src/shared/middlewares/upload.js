import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import env from '../../config/env.js';
import ApiError from '../utils/ApiError.js';

// Extension comes from the detected mimetype, never from the client's filename. No SVG (can carry scripts).
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export function uploadDir(folder) {
  return path.join(env.UPLOAD_DIR, folder);
}

// Single image in field `field`, saved to <UPLOAD_DIR>/<folder>/<random>.<ext>
export function imageUpload(folder, field = 'photo', maxMb = env.MAX_UPLOAD_MB) {
  const dir = uploadDir(folder);
  fs.mkdirSync(dir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${IMAGE_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) cb(null, true);
      else cb(ApiError.badRequest('Only JPG, PNG or WebP images are allowed'));
    },
  }).single(field);

  return (req, res, next) => {
    req.uploadLimitMb = maxMb; // used by the error handler's "file too large" message
    upload(req, res, next);
  };
}

// Public URL for a stored file, e.g. /uploads/doctors/abc.jpg
export function publicFileUrl(folder, filename) {
  return `/uploads/${folder}/${filename}`;
}

// Deletes a previously stored file given its public URL. Only the basename is used,
// so a stored value can never point outside the upload folder.
export async function removeStoredFile(folder, fileUrl) {
  if (!fileUrl) return;
  const target = path.join(uploadDir(folder), path.basename(fileUrl));
  await fs.promises.unlink(target).catch((err) => {
    if (err.code !== 'ENOENT') console.warn(`Could not delete ${target}: ${err.message}`);
  });
}
