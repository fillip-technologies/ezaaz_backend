import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import env from '../../config/env.js';
import ApiError from '../utils/ApiError.js';

// Extension comes from the detected mimetype, never from the client's filename. No SVG (can carry scripts).
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm' };

export function uploadDir(folder) {
  return path.join(env.UPLOAD_DIR, folder);
}

// Files in field `field`, saved to <UPLOAD_DIR>/<folder>/<random>.<ext>. maxFiles > 1 fills req.files instead of req.file.
function fileUpload({ folder, field, maxMb, maxFiles = 1, types, typeError }) {
  const dir = uploadDir(folder);
  fs.mkdirSync(dir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${types[file.mimetype]}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxFiles },
    fileFilter: (req, file, cb) => {
      if (types[file.mimetype]) cb(null, true);
      else cb(ApiError.badRequest(typeError));
    },
  });
  const handler = maxFiles > 1 ? upload.array(field, maxFiles) : upload.single(field);

  return (req, res, next) => {
    req.uploadLimitMb = maxMb; // used by the error handler's "file too large" message
    handler(req, res, next);
  };
}

// Single image in field `field`
export function imageUpload(folder, field = 'photo', maxMb = env.MAX_UPLOAD_MB) {
  return fileUpload({ folder, field, maxMb, types: IMAGE_TYPES, typeError: 'Only JPG, PNG or WebP images are allowed' });
}

// Up to `maxFiles` images in field `field` (req.files)
export function imagesUpload(folder, field, maxMb, maxFiles) {
  return fileUpload({ folder, field, maxMb, maxFiles, types: IMAGE_TYPES, typeError: 'Only JPG, PNG or WebP images are allowed' });
}

// Single MP4 / WebM video in field `field`
export function videoUpload(folder, field, maxMb) {
  return fileUpload({ folder, field, maxMb, types: VIDEO_TYPES, typeError: 'Only MP4 or WebM videos are allowed' });
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
