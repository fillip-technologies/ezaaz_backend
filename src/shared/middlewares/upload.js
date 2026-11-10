import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import env from '../../config/env.js';
import ApiError from '../utils/ApiError.js';

// Extension comes from the detected mimetype, never from the client's filename. No SVG (can carry scripts).
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm' };

export function uploadDir(folder, root = env.UPLOAD_DIR) {
  return path.join(root, folder);
}

// Files in field `field`, saved to <root>/<folder>/<random>.<ext> (root defaults to the public UPLOAD_DIR).
// maxFiles > 1 fills req.files instead of req.file.
function fileUpload({ folder, field, maxMb, maxFiles = 1, types, typeError, root }) {
  const dir = uploadDir(folder, root);
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

/* ---------- Private files (patient reports, WhatsApp media): PRIVATE_UPLOAD_DIR, never served statically ---------- */

const DOCUMENT_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
// First bytes of each allowed type, so a renamed file can't pass as a PDF or image
const SIGNATURES = { '.pdf': [0x25, 0x50, 0x44, 0x46], '.jpg': [0xff, 0xd8, 0xff], '.png': [0x89, 0x50, 0x4e, 0x47] };

export const privateDir = (folder) => uploadDir(folder, env.PRIVATE_UPLOAD_DIR);

// Single PDF / JPG / PNG in field `field`, saved privately; checks the file's content matches its type
export function privateDocumentUpload(folder, field = 'file', maxMb = env.MAX_REPORT_MB) {
  const upload = fileUpload({
    folder,
    field,
    maxMb,
    root: env.PRIVATE_UPLOAD_DIR,
    types: DOCUMENT_TYPES,
    typeError: 'Only PDF, JPG or PNG files are allowed',
  });
  return (req, res, next) =>
    upload(req, res, async (err) => {
      if (err || !req.file) return next(err);
      const signature = SIGNATURES[path.extname(req.file.filename)];
      const handle = await fs.promises.open(req.file.path, 'r');
      const { buffer } = await handle.read(Buffer.alloc(signature.length), 0, signature.length, 0).finally(() => handle.close());
      if (signature.every((byte, i) => buffer[i] === byte)) return next();
      await fs.promises.unlink(req.file.path).catch(() => {});
      next(ApiError.badRequest('The file content is not a valid PDF, JPG or PNG'));
    });
}

const MEDIA_EXTENSIONS = {
  ...DOCUMENT_TYPES,
  'image/webp': '.webp',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
};

// Saves a buffer (e.g. media a patient sent on WhatsApp) privately; returns the stored file name
export async function savePrivateFile(folder, buffer, mime) {
  const dir = privateDir(folder);
  await fs.promises.mkdir(dir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}${MEDIA_EXTENSIONS[String(mime).split(';')[0]] || '.bin'}`;
  await fs.promises.writeFile(path.join(dir, name), buffer);
  return name;
}

// Path of a privately stored file. Only the basename is used, so a stored value can't point elsewhere.
export const privateFilePath = (folder, storedName) => path.join(privateDir(folder), path.basename(String(storedName)));

export async function removePrivateFile(folder, storedName) {
  if (!storedName) return;
  await fs.promises.unlink(privateFilePath(folder, storedName)).catch((err) => {
    if (err.code !== 'ENOENT') console.warn(`Could not delete private file ${storedName}: ${err.message}`);
  });
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
