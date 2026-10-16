// Imports the hospital's existing articles (scripts/data/blogs.json, blog-categories.json + covers).
// Run after `npm run seed:doctors` so authors can be linked.
// Usage: npm run seed:blogs            -> adds categories/articles whose slug isn't in the DB yet
//        npm run seed:blogs -- --fresh -> deletes ALL articles (and covers) and categories first
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB, disconnectDB } from '../config/database.js';
import { connectCache, cacheDel, disconnectCache } from '../config/cache.js';
import Blog from '../modules/blog/blog.model.js';
import BlogCategory from '../modules/blog/blogCategory.model.js';
import Doctor from '../modules/doctor/doctor.model.js';
import { COVER_FOLDER, PUBLIC_BLOGS_KEY } from '../modules/blog/blog.service.js';
import { publicFileUrl, removeStoredFile, uploadDir } from '../shared/middlewares/upload.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const fresh = process.argv.includes('--fresh');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));

function copyCover(coverFile) {
  const source = path.join(DATA_DIR, 'blog-covers', coverFile || '');
  if (!coverFile || !fs.existsSync(source)) {
    if (coverFile) console.warn(`  cover not found: ${coverFile}`);
    return '';
  }
  const dir = uploadDir(COVER_FOLDER);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}${path.extname(coverFile).toLowerCase()}`;
  fs.copyFileSync(source, path.join(dir, filename));
  return publicFileUrl(COVER_FOLDER, filename);
}

async function seed() {
  const categories = readJson('blog-categories.json');
  const blogs = readJson('blogs.json');
  await connectDB();
  connectCache();

  if (fresh) {
    const existing = await Blog.find().select('coverImage').lean();
    await Promise.all(existing.map((b) => removeStoredFile(COVER_FOLDER, b.coverImage)));
    const removedBlogs = (await Blog.deleteMany({})).deletedCount;
    const removedCats = (await BlogCategory.deleteMany({})).deletedCount;
    console.log(`Removed ${removedBlogs} articles and ${removedCats} categories`);
  }

  for (const category of categories) {
    if (await BlogCategory.exists({ slug: category.slug })) continue;
    await BlogCategory.create(category);
    console.log(`  category ${category.slug}`);
  }
  const categoryIds = new Map((await BlogCategory.find().lean()).map((c) => [c.slug, c._id]));
  const doctorIds = new Map((await Doctor.find().select('slug').lean()).map((d) => [d.slug, d._id]));

  let created = 0;
  for (const { coverFile, categorySlug, authorDoctorSlug, ...data } of blogs) {
    if (await Blog.exists({ slug: data.slug })) {
      console.log(`  skip ${data.slug} (already exists)`);
      continue;
    }
    const authorDoctor = authorDoctorSlug ? doctorIds.get(authorDoctorSlug) ?? null : null;
    if (authorDoctorSlug && !authorDoctor) console.warn(`  ${data.slug}: author ${authorDoctorSlug} not found, left empty`);
    await Blog.create({ ...data, category: categoryIds.get(categorySlug), authorDoctor, coverImage: copyCover(coverFile) });
    console.log(`  added ${data.slug}${data.isFeatured ? ' (featured)' : ''}`);
    created++;
  }
  console.log(`Articles seeded: ${created} added, ${blogs.length - created} skipped`);

  // Give Redis a moment to connect so the stale public payload is cleared
  await new Promise((r) => setTimeout(r, 1000));
  await cacheDel(PUBLIC_BLOGS_KEY);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([disconnectDB(), disconnectCache()]));
