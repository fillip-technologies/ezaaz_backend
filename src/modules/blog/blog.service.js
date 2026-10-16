import mongoose from 'mongoose';
import Blog, { estimateReadTime } from './blog.model.js';
import BlogCategory from './blogCategory.model.js';
import Doctor from '../doctor/doctor.model.js';
import ApiError from '../../shared/utils/ApiError.js';
import { cacheDel, cacheGet, cacheSet } from '../../config/cache.js';
import { publicFileUrl, removeStoredFile } from '../../shared/middlewares/upload.js';
import { slugify, uniqueSlug } from '../../shared/utils/schemas.js';

export const COVER_FOLDER = 'blogs';
export const PUBLIC_BLOGS_KEY = 'blogs:public:all';

const BLOG_FIELDS = [
  'slug', 'title', 'excerpt', 'category', 'authorDoctor', 'publishedAt', 'readTimeMinutes',
  'status', 'isFeatured', 'keyHighlights', 'sections', 'tags',
];
const CATEGORY_FIELDS = ['slug', 'name', 'order'];

function pick(body, fields) {
  const data = {};
  for (const key of fields) if (body[key] !== undefined) data[key] = body[key];
  return data;
}

const isObjectId = (v) => mongoose.isValidObjectId(v) && String(new mongoose.Types.ObjectId(String(v))) === String(v);

// Category must exist; author (optional) must be an existing doctor
async function checkReferences(data) {
  if (data.category !== undefined) {
    if (!isObjectId(data.category) || !(await BlogCategory.exists({ _id: data.category }))) {
      throw new ApiError(400, 'Validation failed', [{ field: 'category', message: 'Choose a valid category' }]);
    }
  }
  if (data.authorDoctor === '') data.authorDoctor = null;
  if (data.authorDoctor) {
    if (!isObjectId(data.authorDoctor) || !(await Doctor.exists({ _id: data.authorDoctor }))) {
      throw new ApiError(400, 'Validation failed', [{ field: 'authorDoctor', message: 'Choose a valid doctor' }]);
    }
  }
  if (data.readTimeMinutes === '' || data.readTimeMinutes === 0) data.readTimeMinutes = null;
  if (Array.isArray(data.tags)) data.tags = [...new Set(data.tags.map((t) => String(t).trim()).filter(Boolean))];
}

// Blogs, categories and the author link all feed the one cached public payload
export function invalidatePublicBlogs() {
  return cacheDel(PUBLIC_BLOGS_KEY);
}

/* ----------------------------- Public (website) ----------------------------- */

// Redis first, then MongoDB: { categories, posts } with all published posts (newest first).
// Scheduled posts (future date) are cached too and filtered out at read time, so they go live on time.
async function loadPublicBlogs() {
  const cached = await cacheGet(PUBLIC_BLOGS_KEY);
  if (cached) return { data: cached, source: 'cache' };

  const [categories, posts] = await Promise.all([
    BlogCategory.find().sort({ order: 1, createdAt: 1 }).lean(),
    Blog.find({ status: 'published' }).sort({ publishedAt: -1 }).lean(),
  ]);
  const categoryById = new Map(categories.map((c) => [String(c._id), c]));

  const data = {
    categories: categories.map(({ _id, slug, name }) => ({ _id, slug, name })),
    posts: posts.map(({ __v, status, createdAt, updatedAt, readTimeMinutes, ...post }) => {
      const category = categoryById.get(String(post.category));
      return {
        ...post,
        category: category ? { slug: category.slug, name: category.name } : null,
        readTimeMinutes: readTimeMinutes || estimateReadTime(post),
      };
    }),
  };
  await cacheSet(PUBLIC_BLOGS_KEY, data);
  return { data, source: 'db' };
}

const isLive = (post) => new Date(post.publishedAt) <= new Date();

// List view: everything except the article body
export async function listPublicBlogs() {
  const { data, source } = await loadPublicBlogs();
  const posts = data.posts.filter(isLive).map(({ sections, keyHighlights, ...card }) => card);
  return { data: { categories: data.categories, posts }, source };
}

export async function getPublicBlog(slug) {
  const { data, source } = await loadPublicBlogs();
  const post = data.posts.find((p) => p.slug === String(slug).toLowerCase() && isLive(p));
  if (!post) throw ApiError.notFound('Article not found');
  return { post, source };
}

/* ------------------------------ Admin: blogs ------------------------------ */

export function listAllBlogs() {
  return Blog.find()
    .select('-sections -keyHighlights')
    .populate('category', 'slug name')
    .sort({ publishedAt: -1 });
}

export async function getBlogById(id) {
  const blog = await Blog.findById(id);
  if (!blog) throw ApiError.notFound('Article not found');
  return blog;
}

export async function createBlog(body) {
  const data = pick(body, BLOG_FIELDS);
  await checkReferences(data);
  data.slug = data.slug ? slugify(data.slug) : await uniqueSlug(Blog, slugify(data.title?.en) || 'article');
  const blog = await Blog.create(data);
  await invalidatePublicBlogs();
  return blog;
}

export async function updateBlog(id, body) {
  const blog = await getBlogById(id);
  const data = pick(body, BLOG_FIELDS);
  await checkReferences(data);
  if (data.slug !== undefined) data.slug = slugify(data.slug) || blog.slug;
  blog.set(data);
  await blog.save();
  await invalidatePublicBlogs();
  return blog;
}

export async function deleteBlog(id) {
  const blog = await getBlogById(id);
  await blog.deleteOne();
  await removeStoredFile(COVER_FOLDER, blog.coverImage);
  await invalidatePublicBlogs();
}

export async function setBlogCover(id, file) {
  if (!file) throw ApiError.badRequest('Choose an image to upload (field "cover")');
  let blog;
  try {
    blog = await getBlogById(id);
  } catch (err) {
    await removeStoredFile(COVER_FOLDER, file.filename);
    throw err;
  }
  const previous = blog.coverImage;
  blog.coverImage = publicFileUrl(COVER_FOLDER, file.filename);
  await blog.save();
  await removeStoredFile(COVER_FOLDER, previous);
  await invalidatePublicBlogs();
  return blog;
}

export async function removeBlogCover(id) {
  const blog = await getBlogById(id);
  const previous = blog.coverImage;
  blog.coverImage = '';
  await blog.save();
  await removeStoredFile(COVER_FOLDER, previous);
  await invalidatePublicBlogs();
  return blog;
}

/* ---------------------------- Admin: categories ---------------------------- */

export async function listCategoriesWithCounts() {
  const [categories, counts] = await Promise.all([
    BlogCategory.find().sort({ order: 1, createdAt: 1 }).lean(),
    Blog.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map(({ __v, ...c }) => ({ ...c, postCount: countById.get(String(c._id)) || 0 }));
}

export async function createCategory(body) {
  const data = pick(body, CATEGORY_FIELDS);
  data.slug = data.slug ? slugify(data.slug) : await uniqueSlug(BlogCategory, slugify(data.name?.en) || 'category');
  if (data.order === undefined) {
    const last = await BlogCategory.findOne().sort({ order: -1 }).select('order').lean();
    data.order = (last?.order ?? 0) + 1;
  }
  const category = await BlogCategory.create(data);
  await invalidatePublicBlogs();
  return category;
}

export async function updateCategory(id, body) {
  const category = await BlogCategory.findById(id);
  if (!category) throw ApiError.notFound('Category not found');
  const data = pick(body, CATEGORY_FIELDS);
  if (data.slug !== undefined) data.slug = slugify(data.slug) || category.slug;
  category.set(data);
  await category.save();
  await invalidatePublicBlogs();
  return category;
}

export async function deleteCategory(id) {
  const category = await BlogCategory.findById(id);
  if (!category) throw ApiError.notFound('Category not found');
  const inUse = await Blog.countDocuments({ category: category._id });
  if (inUse) {
    throw ApiError.conflict(`${inUse} article${inUse === 1 ? ' uses' : 's use'} this category. Move them to another category first.`);
  }
  await category.deleteOne();
  await invalidatePublicBlogs();
}
