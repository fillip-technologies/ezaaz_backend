import mongoose from 'mongoose';
import GalleryItem, { YOUTUBE_ID } from './gallery.model.js';
import GalleryCategory from './galleryCategory.model.js';
import ApiError from '../../shared/utils/ApiError.js';
import { cacheDel, cacheGet, cacheSet } from '../../config/cache.js';
import { publicFileUrl, removeStoredFile } from '../../shared/middlewares/upload.js';
import { slugify, uniqueSlug } from '../../shared/utils/schemas.js';

export const MEDIA_FOLDER = 'gallery';
export const PUBLIC_GALLERY_KEY = 'gallery:public:all';

const ITEM_FIELDS = ['title', 'label', 'category', 'position', 'duration', 'showOnHome', 'isActive'];
const CATEGORY_FIELDS = ['slug', 'name', 'order'];

function pick(body, fields) {
  const data = {};
  for (const key of fields) if (body[key] !== undefined) data[key] = body[key];
  return data;
}

const isObjectId = (v) => mongoose.isValidObjectId(v) && String(new mongoose.Types.ObjectId(String(v))) === String(v);
const toBool = (v) => v === true || v === 'true' || v === '1' || v === 'on';
const removeFiles = (files) => Promise.all(files.map((f) => removeStoredFile(MEDIA_FOLDER, f.filename)));

// Accepts a YouTube watch / share / embed / shorts link or a bare 11-character id. '' = no YouTube video.
export function parseYoutubeId(input) {
  const value = String(input ?? '').trim();
  if (!value) return '';
  if (YOUTUBE_ID.test(value)) return value;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (['youtube.com', 'youtube-nocookie.com', 'music.youtube.com'].includes(host)) {
    id = url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1];
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

async function checkCategory(data) {
  if (data.category === '' || data.category === 'null') data.category = null;
  if (data.category && (!isObjectId(data.category) || !(await GalleryCategory.exists({ _id: data.category })))) {
    throw new ApiError(400, 'Validation failed', [{ field: 'category', message: 'Choose a valid category' }]);
  }
}

function applyYoutube(data, body) {
  if (body.youtube === undefined) return;
  const id = parseYoutubeId(body.youtube);
  if (id === null) throw new ApiError(400, 'Validation failed', [{ field: 'youtube', message: 'Enter a valid YouTube link' }]);
  data.youtubeId = id;
}

// New items go first: one below the current lowest order of that type
async function topOrder(type) {
  const first = await GalleryItem.findOne({ type }).sort({ order: 1 }).select('order').lean();
  return (first?.order ?? 1) - 1;
}

export function invalidatePublicGallery() {
  return cacheDel(PUBLIC_GALLERY_KEY);
}

/* ----------------------------- Public (website) ----------------------------- */

// Redis first, then MongoDB: { categories, photos, videos } — visible, complete items in display order
export async function getPublicGallery() {
  const cached = await cacheGet(PUBLIC_GALLERY_KEY);
  if (cached) return { data: cached, source: 'cache' };

  const [categories, items] = await Promise.all([
    GalleryCategory.find().sort({ order: 1, createdAt: 1 }).lean(),
    GalleryItem.find({ isActive: true }).sort({ order: 1, createdAt: -1 }).lean(),
  ]);
  const categoryById = new Map(categories.map((c) => [String(c._id), c]));
  const card = ({ __v, isActive, order, createdAt, updatedAt, ...item }) => {
    const category = categoryById.get(String(item.category));
    return { ...item, category: category ? { slug: category.slug, name: category.name } : null };
  };

  const data = {
    categories: categories.map(({ _id, slug, name }) => ({ _id, slug, name })),
    photos: items.filter((i) => i.type === 'photo' && i.image).map(card),
    // Uploaded files need a thumbnail (there is no server-side frame grab); YouTube has its own
    videos: items.filter((i) => i.type === 'video' && (i.youtubeId || (i.videoFile && i.image))).map(card),
  };
  await cacheSet(PUBLIC_GALLERY_KEY, data);
  return { data, source: 'db' };
}

/* ------------------------------ Admin: items ------------------------------ */

export function listItems() {
  return GalleryItem.find().populate('category', 'slug name').sort({ order: 1, createdAt: -1 });
}

export async function getItemById(id) {
  const item = await GalleryItem.findById(id);
  if (!item) throw ApiError.notFound('Gallery item not found');
  return item;
}

// JSON create, used for videos (the file / thumbnail are uploaded afterwards). Photos are created by uploadPhotos.
export async function createVideo(body) {
  const data = pick(body, ITEM_FIELDS);
  data.category = null;
  applyYoutube(data, body);
  data.type = 'video';
  data.order = await topOrder('video');
  const item = await GalleryItem.create(data);
  await invalidatePublicGallery();
  return item.populate('category', 'slug name');
}

// Bulk photo upload: one gallery item per file, all with the same category / home setting
export async function uploadPhotos(files, body) {
  if (!files?.length) throw ApiError.badRequest('Choose at least one image to upload (field "photos")');
  try {
    const data = pick(body, ['category', 'position']);
    await checkCategory(data);
    const showOnHome = toBool(body.showOnHome);
    // All go above the existing photos, keeping the chosen file order
    const start = (await topOrder('photo')) - files.length + 1;
    const items = await GalleryItem.insertMany(
      files.map((file, i) => ({
        ...data,
        type: 'photo',
        showOnHome,
        image: publicFileUrl(MEDIA_FOLDER, file.filename),
        order: start + i,
      })),
    );
    await invalidatePublicGallery();
    return GalleryItem.populate(items, { path: 'category', select: 'slug name' });
  } catch (err) {
    await removeFiles(files);
    throw err;
  }
}

export async function updateItem(id, body) {
  const item = await getItemById(id);
  const data = pick(body, ITEM_FIELDS);
  if (item.type === 'video') delete data.category;
  await checkCategory(data);
  const previousFile = item.videoFile;
  if (item.type === 'video') {
    applyYoutube(data, body);
    // One source per video: choosing YouTube drops the uploaded file
    if (data.youtubeId) data.videoFile = '';
  }
  item.set(data);
  await item.save();
  if (previousFile && !item.videoFile) await removeStoredFile(MEDIA_FOLDER, previousFile);
  await invalidatePublicGallery();
  return item.populate('category', 'slug name');
}

export async function deleteItem(id) {
  const item = await getItemById(id);
  await item.deleteOne();
  await Promise.all([removeStoredFile(MEDIA_FOLDER, item.image), removeStoredFile(MEDIA_FOLDER, item.videoFile)]);
  await invalidatePublicGallery();
}

// Replaces a photo, or a video's thumbnail
export async function setItemImage(id, file) {
  if (!file) throw ApiError.badRequest('Choose an image to upload (field "image")');
  let item;
  try {
    item = await getItemById(id);
  } catch (err) {
    await removeStoredFile(MEDIA_FOLDER, file.filename);
    throw err;
  }
  const previous = item.image;
  item.image = publicFileUrl(MEDIA_FOLDER, file.filename);
  await item.save();
  await removeStoredFile(MEDIA_FOLDER, previous);
  await invalidatePublicGallery();
  return item.populate('category', 'slug name');
}

// Video thumbnails only: a photo without its image would be meaningless (delete the photo instead)
export async function removeItemImage(id) {
  const item = await getItemById(id);
  if (item.type !== 'video') throw ApiError.badRequest('A photo needs its image. Replace it or delete the photo.');
  const previous = item.image;
  item.image = '';
  await item.save();
  await removeStoredFile(MEDIA_FOLDER, previous);
  await invalidatePublicGallery();
  return item.populate('category', 'slug name');
}

export async function setItemVideo(id, file) {
  if (!file) throw ApiError.badRequest('Choose a video to upload (field "video")');
  let item;
  try {
    item = await getItemById(id);
    if (item.type !== 'video') throw ApiError.badRequest('Only video items can have a video file');
  } catch (err) {
    await removeStoredFile(MEDIA_FOLDER, file.filename);
    throw err;
  }
  const previous = item.videoFile;
  item.videoFile = publicFileUrl(MEDIA_FOLDER, file.filename);
  item.youtubeId = '';
  await item.save();
  await removeStoredFile(MEDIA_FOLDER, previous);
  await invalidatePublicGallery();
  return item.populate('category', 'slug name');
}

// `ids` = every item of one type in the new display order
export async function reorderItems(body) {
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  if (!ids.length || ids.some((id) => !isObjectId(id)) || new Set(ids).size !== ids.length) {
    throw ApiError.badRequest('Send the item ids in their new order');
  }
  const result = await GalleryItem.bulkWrite(ids.map((id, order) => ({ updateOne: { filter: { _id: id }, update: { order } } })));
  if (result.matchedCount !== ids.length) throw ApiError.badRequest('Some items no longer exist. Reload and try again.');
  await invalidatePublicGallery();
}

/* ---------------------------- Admin: categories ---------------------------- */

export async function listCategoriesWithCounts() {
  const [categories, counts] = await Promise.all([
    GalleryCategory.find().sort({ order: 1, createdAt: 1 }).lean(),
    GalleryItem.aggregate([{ $match: { type: 'photo' } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map(({ __v, ...c }) => ({ ...c, photoCount: countById.get(String(c._id)) || 0 }));
}

export async function createCategory(body) {
  const data = pick(body, CATEGORY_FIELDS);
  data.slug = data.slug ? slugify(data.slug) : await uniqueSlug(GalleryCategory, slugify(data.name?.en) || 'category');
  if (data.order === undefined) {
    const last = await GalleryCategory.findOne().sort({ order: -1 }).select('order').lean();
    data.order = (last?.order ?? 0) + 1;
  }
  const category = await GalleryCategory.create(data);
  await invalidatePublicGallery();
  return category;
}

export async function updateCategory(id, body) {
  const category = await GalleryCategory.findById(id);
  if (!category) throw ApiError.notFound('Category not found');
  const data = pick(body, CATEGORY_FIELDS);
  if (data.slug !== undefined) data.slug = slugify(data.slug) || category.slug;
  category.set(data);
  await category.save();
  await invalidatePublicGallery();
  return category;
}

export async function deleteCategory(id) {
  const category = await GalleryCategory.findById(id);
  if (!category) throw ApiError.notFound('Category not found');
  const inUse = await GalleryItem.countDocuments({ category: category._id });
  if (inUse) {
    throw ApiError.conflict(`${inUse} photo${inUse === 1 ? ' uses' : 's use'} this category. Move them to another category first.`);
  }
  await category.deleteOne();
  await invalidatePublicGallery();
}
