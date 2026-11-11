import crypto from 'node:crypto';
import fs from 'node:fs';
import { v2 as cloudinary } from 'cloudinary';
import env from './env.js';

export const isCloudinaryConfigured = () =>
  Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// Files bigger than this go up in parts (Cloudinary refuses single requests over 100 MB)
const CHUNK_BYTES = 20 * 1024 * 1024;
// The SDK's default is 60 s, too short for a large video on a slow connection
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 60 * 1000;

const folderPath = (folder) => (folder ? `ezaaz/${folder.replace(/^\/+|\/+$/g, '')}` : 'ezaaz');

/**
 * Upload a file held in memory to Cloudinary (no temp file on disk).
 * access 'public': website media, anyone with the URL can load it from Cloudinary's CDN.
 * access 'private': type 'authenticated', so the URL alone gives nothing; read it back with downloadPrivate().
 * @param {Buffer} buffer
 * @param {object} [options]
 * @param {string} [options.folder] - Subfolder name inside ezaaz namespace
 * @param {string} [options.resourceType='auto'] - 'image' | 'video' | 'auto' | 'raw'
 * @param {'public'|'private'} [options.access='public']
 * @param {string} [options.ext] - Raw files only: extension kept on the public id, e.g. '.pdf'
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, format: string, bytes: number }>}
 */
export function uploadBuffer(buffer, { folder = '', resourceType = 'auto', access = 'public', ext = '' } = {}) {
  const options = {
    folder: folderPath(folder),
    resource_type: resourceType,
    type: access === 'private' ? 'authenticated' : 'upload',
    timeout: UPLOAD_TIMEOUT_MS,
    // Cloudinary names raw files exactly as given, so pick a random name ourselves
    ...(resourceType === 'raw' && { public_id: `${crypto.randomBytes(16).toString('hex')}${ext}` }),
  };
  return new Promise((resolve, reject) => {
    const done = (err, result) =>
      err
        ? reject(err)
        : resolve({
            url: result.secure_url,
            publicId: result.public_id,
            resourceType: result.resource_type,
            format: result.format || '',
            bytes: result.bytes,
          });
    const stream =
      buffer.length > CHUNK_BYTES
        ? cloudinary.uploader.upload_chunked_stream({ ...options, chunk_size: CHUNK_BYTES }, done)
        : cloudinary.uploader.upload_stream(options, done);
    stream.end(buffer);
  });
}

/**
 * Upload a local file to Cloudinary and return its secure URL (seed and migration scripts).
 * @param {string} filePath - Absolute or relative path to local file
 * @param {object} [options] - Same as uploadBuffer
 */
export async function uploadToCloudinary(filePath, options = {}) {
  return uploadBuffer(await fs.promises.readFile(filePath), options);
}

/**
 * Bytes of a private (authenticated) file, or null if it doesn't exist. Uses the signed download API, which works
 * for every file type (the CDN refuses PDFs on accounts where "Allow delivery of PDF and ZIP files" is off).
 * @param {string} publicId
 * @param {object} [options]
 * @param {string} [options.resourceType='raw']
 * @param {string} [options.format] - Needed for image/video files, e.g. 'mp4'
 */
export async function downloadPrivate(publicId, { resourceType = 'raw', format = '' } = {}) {
  const url = cloudinary.utils.private_download_url(publicId, format, { resource_type: resourceType, type: 'authenticated' });
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cloudinary download failed (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract publicId and resourceType from a Cloudinary URL.
 * e.g. https://res.cloudinary.com/cloud_name/image/upload/v12345/ezaaz/folder/img.png
 * Raw files keep their extension in the public id.
 */
export function parseCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  const [, resourceType, rest] = match;
  return { resourceType, publicId: resourceType === 'raw' ? rest : rest.replace(/\.[^./]+$/, '') };
}

/**
 * Delete a file from Cloudinary given its URL or publicId.
 * @param {string} urlOrPublicId
 * @param {object} [options]
 * @param {string} [options.resourceType]
 * @param {string} [options.type='upload'] - 'authenticated' for private files
 */
export async function deleteFromCloudinary(urlOrPublicId, { resourceType, type = 'upload' } = {}) {
  if (!urlOrPublicId || !isCloudinaryConfigured()) return null;
  let publicId = urlOrPublicId;
  let rt = resourceType || 'image';

  if (/^https?:\/\/res\.cloudinary\.com\//i.test(urlOrPublicId)) {
    const parsed = parseCloudinaryUrl(urlOrPublicId);
    if (!parsed) return null;
    publicId = parsed.publicId;
    rt = resourceType || parsed.resourceType;
  }

  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: rt, type, invalidate: true });
  } catch (err) {
    console.warn(`Failed to delete Cloudinary asset (${publicId}):`, err.message);
    return null;
  }
}

export default cloudinary;
