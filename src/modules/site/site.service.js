import SiteSetting, { PAGE_BANNER_KEYS } from './site.model.js';
import ApiError from '../../shared/utils/ApiError.js';
import { cacheDel, cacheGet, cacheSet } from '../../config/cache.js';
import { publicFileUrl, removeStoredFile } from '../../shared/middlewares/upload.js';

export const MEDIA_FOLDER = 'site';
export const PUBLIC_SITE_KEY = 'site:public';

const videoField = (key) => `${key}Video`;
const bannerField = (key) => `pageBanners.${key}`;
const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => o?.[k], obj);

// The single settings document, created on first use
function getSettings() {
  return SiteSetting.findOneAndUpdate({}, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
}

const toPublic = (s) => ({
  introVideo: s.introVideo,
  heroVideo: s.heroVideo,
  heroStats: s.heroStats.map(({ icon, value, label }) => ({ icon, value, label: { en: label.en, hi: label.hi } })),
  pageBanners: Object.fromEntries(PAGE_BANNER_KEYS.map((key) => [key, s.pageBanners?.[key] || ''])),
});

/* ----------------------------- Public (website) ----------------------------- */

// Redis first, then MongoDB: { introVideo, heroVideo, heroStats, pageBanners } — '' / [] = use the website's built-in video / numbers / image
export async function getPublicSettings() {
  const cached = await cacheGet(PUBLIC_SITE_KEY);
  if (cached) return { data: cached, source: 'cache' };
  const data = toPublic(await getSettings());
  await cacheSet(PUBLIC_SITE_KEY, data);
  return { data, source: 'db' };
}

/* ---------------------------------- Admin ---------------------------------- */

export function getAdminSettings() {
  return getSettings();
}

// Sets one media field (a section's video or a page's banner) in a single atomic write and deletes the
// file it replaced, so every replaced upload is removed even when two uploads overlap. The built-in
// videos and images live in the website's code, not in uploads, so they are never deleted.
// `uploadedFile` = the new file on disk, deleted again if the write fails so it never lingers unused.
async function swapMedia(path, value, uploadedFile) {
  let before;
  try {
    before = await SiteSetting.findOneAndUpdate({}, { $set: { [path]: value } }, { upsert: true, new: false }).lean();
  } catch (err) {
    if (uploadedFile) await removeStoredFile(MEDIA_FOLDER, uploadedFile);
    throw err;
  }
  const previous = getPath(before, path);
  if (previous && previous !== value) await removeStoredFile(MEDIA_FOLDER, previous);
  await cacheDel(PUBLIC_SITE_KEY);
  return getSettings();
}

// Replaces one section's video; the previously uploaded video of that section is deleted
export function setVideo(key, file) {
  if (!file) throw ApiError.badRequest('Choose a video to upload (field "video")');
  return swapMedia(videoField(key), publicFileUrl(MEDIA_FOLDER, file.filename), file.filename);
}

// Back to the built-in video: the uploaded file is deleted
export function resetVideo(key) {
  return swapMedia(videoField(key), '');
}

// Replaces one page's top banner image; the previously uploaded image of that page is deleted
export function setPageBanner(key, file) {
  if (!file) throw ApiError.badRequest('Choose an image to upload (field "image")');
  return swapMedia(bannerField(key), publicFileUrl(MEDIA_FOLDER, file.filename), file.filename);
}

// Back to the page's built-in banner: the uploaded image is deleted
export function resetPageBanner(key) {
  return swapMedia(bannerField(key), '');
}

// Replaces the home header stats. [] = back to the website's built-in numbers.
export async function updateHeroStats(body) {
  if (!Array.isArray(body?.heroStats)) throw ApiError.badRequest('Send the stats as a list (field "heroStats")');
  const heroStats = body.heroStats.map((stat) => ({ icon: stat?.icon, value: stat?.value, label: stat?.label }));
  const settings = await getSettings();
  settings.heroStats = heroStats;
  await settings.save();
  await cacheDel(PUBLIC_SITE_KEY);
  return settings;
}
