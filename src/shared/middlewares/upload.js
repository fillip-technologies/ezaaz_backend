import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import env from '../../config/env.js';
import ApiError from '../utils/ApiError.js';
import { cacheDel, cacheGetBuffer, cacheSetBuffer } from '../../config/cache.js';
import {
  isCloudinaryConfigured,
  uploadBuffer,
  downloadPrivate,
  deleteFromCloudinary,
} from '../../config/cloudinary.js';

// Uploads are held in memory and sent straight to Cloudinary. Without Cloudinary they're written to
// UPLOAD_DIR (public, served at /uploads) or PRIVATE_UPLOAD_DIR (reports, WhatsApp media) instead.

// Extension comes from the detected mimetype, never from the client's filename. No SVG (can carry scripts).
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm' };

export function uploadDir(folder, root = env.UPLOAD_DIR) {
  return path.join(root, folder);
}

const randomName = (ext) => `${crypto.randomBytes(16).toString('hex')}${ext}`;

// Cloudinary answers 400 for files it won't take (too large for the plan, too many pixels, not a real image/video)
function storageError(err) {
  if (err?.http_code !== 400) return err;
  return ApiError.badRequest(
    /file size too large/i.test(err.message)
      ? 'The file is too large for the media storage (max 10 MB for photos and documents, 100 MB for videos)'
      : `The media storage refused the file: ${err.message}`,
  );
}

/* ---------- Public website media: Cloudinary URL, or a file in UPLOAD_DIR ---------- */

// Returns what the services store as file.filename: the Cloudinary URL, or the local file name
async function savePublicFile(folder, buffer, mime, resourceType) {
  if (isCloudinaryConfigured()) return (await uploadBuffer(buffer, { folder, resourceType })).url;
  const dir = uploadDir(folder);
  await fs.promises.mkdir(dir, { recursive: true });
  const name = randomName(IMAGE_TYPES[mime] || VIDEO_TYPES[mime]);
  await fs.promises.writeFile(path.join(dir, name), buffer);
  return name;
}

// Files in field `field`, kept in memory (file.buffer) and then stored by `save(file)`, which returns the stored name
// (file.filename). maxFiles > 1 fills req.files instead of req.file.
function fileUpload({ field, maxMb, maxFiles = 1, types, typeError, save }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxFiles },
    fileFilter: (req, file, cb) => {
      if (types[file.mimetype]) cb(null, true);
      else cb(ApiError.badRequest(typeError));
    },
  });
  const handler = maxFiles > 1 ? upload.array(field, maxFiles) : upload.single(field);

  return (req, res, next) => {
    req.uploadLimitMb = maxMb; // used by the error handler's "file too large" message
    handler(req, res, async (err) => {
      if (err) return next(err);
      const files = req.files ?? (req.file ? [req.file] : []);
      const results = await Promise.allSettled(files.map(save));
      const failed = results.find((r) => r.status === 'rejected');
      if (!failed) {
        results.forEach((r, i) => (files[i].filename = r.value));
        return next();
      }
      // One file of a batch failed: remove the ones already stored so nothing is left without a record
      await Promise.all(results.map((r) => r.status === 'fulfilled' && r.value && save.remove?.(r.value)));
      next(storageError(failed.reason));
    });
  };
}

function publicUpload({ folder, resourceType, ...options }) {
  const save = (file) => savePublicFile(folder, file.buffer, file.mimetype, resourceType);
  save.remove = (stored) => removeStoredFile(folder, stored);
  return fileUpload({ ...options, save });
}

// Single image in field `field`
export function imageUpload(folder, field = 'photo', maxMb = env.MAX_UPLOAD_MB) {
  return publicUpload({ folder, field, maxMb, resourceType: 'image', types: IMAGE_TYPES, typeError: 'Only JPG, PNG or WebP images are allowed' });
}

// Up to `maxFiles` images in field `field` (req.files)
export function imagesUpload(folder, field, maxMb, maxFiles) {
  return publicUpload({ folder, field, maxMb, maxFiles, resourceType: 'image', types: IMAGE_TYPES, typeError: 'Only JPG, PNG or WebP images are allowed' });
}

// Single MP4 / WebM video in field `field`
export function videoUpload(folder, field, maxMb) {
  return publicUpload({ folder, field, maxMb, resourceType: 'video', types: VIDEO_TYPES, typeError: 'Only MP4 or WebM videos are allowed' });
}

/* ---------- Private files (patient reports, WhatsApp media): never reachable by URL ---------- */

// Stored names: "cloudinary:<resource type>/<public id>" for files on Cloudinary (type 'authenticated');
// anything else is a file name in PRIVATE_UPLOAD_DIR/<folder> (saved without Cloudinary, or before it was set up).
const CLOUD_PREFIX = 'cloudinary:';
export const isCloudinaryFile = (storedName) => String(storedName || '').startsWith(CLOUD_PREFIX);

// Raw public ids keep their extension; video ids don't, so the stored name carries it as the format
function parseCloudinaryFile(storedName) {
  const rest = storedName.slice(CLOUD_PREFIX.length);
  const resourceType = rest.slice(0, rest.indexOf('/'));
  const id = rest.slice(resourceType.length + 1);
  if (resourceType === 'raw') return { resourceType, publicId: id, format: '' };
  const dot = id.lastIndexOf('.');
  return { resourceType, publicId: id.slice(0, dot), format: id.slice(dot + 1) };
}

const fileCacheKey = (storedName) => `file:${storedName}`;

const DOCUMENT_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
// First bytes of each allowed type, so a renamed file can't pass as a PDF or image
const SIGNATURES = { '.pdf': [0x25, 0x50, 0x44, 0x46], '.jpg': [0xff, 0xd8, 0xff], '.png': [0x89, 0x50, 0x4e, 0x47] };

export const privateDir = (folder) => uploadDir(folder, env.PRIVATE_UPLOAD_DIR);

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

// Saves a buffer (a report, or media a patient sent on WhatsApp) privately; returns the stored name.
// On Cloudinary, videos are stored as videos (100 MB limit) and everything else byte-for-byte as raw files.
export async function savePrivateFile(folder, buffer, mime) {
  const type = String(mime || '').split(';')[0];
  const ext = MEDIA_EXTENSIONS[type] || '.bin';
  if (isCloudinaryConfigured()) {
    const resourceType = type.startsWith('video/') ? 'video' : 'raw';
    const uploaded = await uploadBuffer(buffer, { folder, resourceType, access: 'private', ext });
    return `${CLOUD_PREFIX}${resourceType}/${uploaded.publicId}${resourceType === 'raw' ? '' : `.${uploaded.format}`}`;
  }
  const dir = privateDir(folder);
  await fs.promises.mkdir(dir, { recursive: true });
  const name = randomName(ext);
  await fs.promises.writeFile(path.join(dir, name), buffer);
  return name;
}

// Single PDF / JPG / PNG in field `field`, saved privately; checks the file's content matches its type
export function privateDocumentUpload(folder, field = 'file', maxMb = env.MAX_REPORT_MB) {
  const save = (file) => {
    const signature = SIGNATURES[DOCUMENT_TYPES[file.mimetype]];
    if (!signature.every((byte, i) => file.buffer[i] === byte)) {
      return Promise.reject(ApiError.badRequest('The file content is not a valid PDF, JPG or PNG'));
    }
    return savePrivateFile(folder, file.buffer, file.mimetype);
  };
  save.remove = (stored) => removePrivateFile(folder, stored);
  return fileUpload({ field, maxMb, types: DOCUMENT_TYPES, typeError: 'Only PDF, JPG or PNG files are allowed', save });
}

// Path of a locally stored private file. Only the basename is used, so a stored value can't point elsewhere.
export const privateFilePath = (folder, storedName) => path.join(privateDir(folder), path.basename(String(storedName)));

// Contents of a private file, or null if it's gone. Files on Cloudinary are cached in Redis (see FILE_CACHE_TTL_SECONDS).
export async function readPrivateFile(folder, storedName) {
  if (!storedName) return null;
  if (!isCloudinaryFile(storedName)) {
    return fs.promises.readFile(privateFilePath(folder, storedName)).catch((err) => {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
  }
  const key = fileCacheKey(storedName);
  const cached = await cacheGetBuffer(key);
  if (cached) return cached;
  const { publicId, resourceType, format } = parseCloudinaryFile(storedName);
  const buffer = await downloadPrivate(publicId, { resourceType, format });
  if (buffer && buffer.length <= env.FILE_CACHE_MAX_KB * 1024) await cacheSetBuffer(key, buffer, env.FILE_CACHE_TTL_SECONDS);
  return buffer;
}

export async function removePrivateFile(folder, storedName) {
  if (!storedName) return;
  if (isCloudinaryFile(storedName)) {
    const { publicId, resourceType } = parseCloudinaryFile(storedName);
    await Promise.all([deleteFromCloudinary(publicId, { resourceType, type: 'authenticated' }), cacheDel(fileCacheKey(storedName))]);
    return;
  }
  await fs.promises.unlink(privateFilePath(folder, storedName)).catch((err) => {
    if (err.code !== 'ENOENT') console.warn(`Could not delete private file ${storedName}: ${err.message}`);
  });
}

/* ---------- Public file URLs ---------- */

// Public URL for a stored file, e.g. /uploads/doctors/abc.jpg or Cloudinary URL
export function publicFileUrl(folder, filename) {
  if (!filename) return '';
  if (/^https?:\/\//i.test(filename)) return filename;
  return `/uploads/${folder}/${filename}`;
}

// Deletes a previously stored file given its public URL or Cloudinary URL.
// Only the basename is used for local files, so a stored value can never point outside the upload folder.
export async function removeStoredFile(folder, fileUrl) {
  if (!fileUrl) return;
  if (/^https?:\/\/res\.cloudinary\.com\//i.test(fileUrl)) {
    await deleteFromCloudinary(fileUrl);
    return;
  }
  const target = path.join(uploadDir(folder), path.basename(fileUrl));
  await fs.promises.unlink(target).catch((err) => {
    if (err.code !== 'ENOENT') console.warn(`Could not delete ${target}: ${err.message}`);
  });
}
