// Imports the photos the website's gallery showed before it was managed in the admin panel
// (scripts/data/gallery.json). The image files are read from the website's assets folder, not stored in this repo.
// Usage: npm run seed:gallery                          -> adds missing categories; adds photos only if the gallery has none
//        npm run seed:gallery -- --fresh               -> deletes ALL gallery items (and their files) and categories first
//        npm run seed:gallery -- --from <assets dir>   -> where the images are (default: ../client/src/assets)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB, disconnectDB } from '../config/database.js';
import { connectCache, cacheDel, disconnectCache } from '../config/cache.js';
import GalleryItem from '../modules/gallery/gallery.model.js';
import GalleryCategory from '../modules/gallery/galleryCategory.model.js';
import { MEDIA_FOLDER, PUBLIC_GALLERY_KEY } from '../modules/gallery/gallery.service.js';
import { publicFileUrl, removeStoredFile, uploadDir } from '../shared/middlewares/upload.js';
import { isCloudinaryConfigured, uploadToCloudinary } from '../config/cloudinary.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const fresh = process.argv.includes('--fresh');
const fromIndex = process.argv.indexOf('--from');
const ASSETS_DIR = path.resolve(fromIndex > -1 ? process.argv[fromIndex + 1] || '' : '../client/src/assets');
const IMAGE_EXT = { '.jpg': '.jpg', '.jpeg': '.jpg', '.png': '.png', '.webp': '.webp' };

async function copyImage(file) {
  const source = path.join(ASSETS_DIR, file);
  const ext = IMAGE_EXT[path.extname(file).toLowerCase()];
  if (!ext || !fs.existsSync(source)) {
    console.warn(`  image not found: ${source}`);
    return '';
  }
  if (isCloudinaryConfigured()) {
    const uploaded = await uploadToCloudinary(source, { folder: MEDIA_FOLDER });
    return uploaded.url;
  }
  const dir = uploadDir(MEDIA_FOLDER);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  fs.copyFileSync(source, path.join(dir, filename));
  return publicFileUrl(MEDIA_FOLDER, filename);
}

async function seed() {
  const { categories, photos } = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'gallery.json'), 'utf8'));
  if (!fs.existsSync(ASSETS_DIR)) throw new Error(`Assets folder not found: ${ASSETS_DIR} (pass --from <dir>)`);
  await connectDB();
  connectCache();
  // The images are copied into this server's upload folder: run the seed on the machine that serves /uploads
  console.log(`Copying images from ${ASSETS_DIR}
  into ${uploadDir(MEDIA_FOLDER)}`);

  if (fresh) {
    const existing = await GalleryItem.find().select('image videoFile').lean();
    await Promise.all(existing.flatMap((i) => [removeStoredFile(MEDIA_FOLDER, i.image), removeStoredFile(MEDIA_FOLDER, i.videoFile)]));
    const removedItems = (await GalleryItem.deleteMany({})).deletedCount;
    const removedCats = (await GalleryCategory.deleteMany({})).deletedCount;
    console.log(`Removed ${removedItems} gallery items and ${removedCats} categories`);
  }

  for (const category of categories) {
    if (await GalleryCategory.exists({ slug: category.slug })) continue;
    await GalleryCategory.create(category);
    console.log(`  category ${category.slug}`);
  }

  const existingPhotos = await GalleryItem.countDocuments({ type: 'photo' });
  if (existingPhotos) {
    console.log(`Photos skipped: the gallery already has ${existingPhotos} (use --fresh to replace them)`);
  } else {
    const categoryIds = new Map((await GalleryCategory.find().lean()).map((c) => [c.slug, c._id]));
    let order = 0;
    for (const { file, categorySlug, ...data } of photos) {
      const image = await copyImage(file);
      if (!image) continue;
      await GalleryItem.create({ ...data, type: 'photo', image, category: categoryIds.get(categorySlug) ?? null, order: order++ });
      console.log(`  added ${file}${data.showOnHome ? ' (home page)' : ''}`);
    }
    console.log(`Photos seeded: ${order} added, ${photos.length - order} missing`);
  }

  // Give Redis a moment to connect so the stale public payload is cleared
  await new Promise((r) => setTimeout(r, 1000));
  await cacheDel(PUBLIC_GALLERY_KEY);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([disconnectDB(), disconnectCache()]));
