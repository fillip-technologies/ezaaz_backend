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

/**
 * Upload a local file to Cloudinary and return its secure URL.
 * @param {string} filePath - Absolute or relative path to local file
 * @param {object} [options]
 * @param {string} [options.folder] - Subfolder name inside ezaaz namespace
 * @param {string} [options.resourceType='auto'] - 'image' | 'video' | 'auto' | 'raw'
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadToCloudinary(filePath, { folder = '', resourceType = 'auto' } = {}) {
  const targetFolder = folder ? `ezaaz/${folder.replace(/^\/+|\/+$/g, '')}` : 'ezaaz';
  const result = await cloudinary.uploader.upload(filePath, {
    folder: targetFolder,
    resource_type: resourceType,
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    format: result.format,
    bytes: result.bytes,
  };
}

/**
 * Extract publicId and resourceType from a Cloudinary URL.
 * e.g. https://res.cloudinary.com/cloud_name/image/upload/v12345/ezaaz/folder/img.png
 */
export function parseCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/([^\/]+)\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
  if (!match) return null;
  return {
    resourceType: match[1] === 'video' ? 'video' : match[1] === 'raw' ? 'raw' : 'image',
    publicId: match[2],
  };
}

/**
 * Delete a file from Cloudinary given its URL or publicId.
 * @param {string} urlOrPublicId
 * @param {object} [options]
 * @param {string} [options.resourceType]
 */
export async function deleteFromCloudinary(urlOrPublicId, { resourceType } = {}) {
  if (!urlOrPublicId || !isCloudinaryConfigured()) return null;
  let publicId = urlOrPublicId;
  let type = resourceType || 'image';

  if (/^https?:\/\/res\.cloudinary\.com\//i.test(urlOrPublicId)) {
    const parsed = parseCloudinaryUrl(urlOrPublicId);
    if (!parsed) return null;
    publicId = parsed.publicId;
    type = resourceType || parsed.resourceType;
  }

  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: type });
  } catch (err) {
    console.warn(`Failed to delete Cloudinary asset (${publicId}):`, err.message);
    return null;
  }
}

export default cloudinary;
