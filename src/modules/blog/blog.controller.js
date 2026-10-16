import * as blogService from './blog.service.js';

/* Public */

export async function listPublic(req, res) {
  const { data, source } = await blogService.listPublicBlogs();
  res.set('X-Cache', source === 'cache' ? 'HIT' : 'MISS');
  res.json({ success: true, data });
}

export async function getPublic(req, res) {
  const { post, source } = await blogService.getPublicBlog(req.params.slug);
  res.set('X-Cache', source === 'cache' ? 'HIT' : 'MISS');
  res.json({ success: true, data: post });
}

/* Admin: articles */

export async function list(req, res) {
  res.json({ success: true, data: await blogService.listAllBlogs() });
}

export async function getById(req, res) {
  res.json({ success: true, data: await blogService.getBlogById(req.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ success: true, data: await blogService.createBlog(req.body ?? {}) });
}

export async function update(req, res) {
  res.json({ success: true, data: await blogService.updateBlog(req.params.id, req.body ?? {}) });
}

export async function remove(req, res) {
  await blogService.deleteBlog(req.params.id);
  res.json({ success: true, message: 'Article deleted' });
}

export async function uploadCover(req, res) {
  res.json({ success: true, data: await blogService.setBlogCover(req.params.id, req.file) });
}

export async function removeCover(req, res) {
  res.json({ success: true, data: await blogService.removeBlogCover(req.params.id) });
}

/* Admin: categories */

export async function listCategories(req, res) {
  res.json({ success: true, data: await blogService.listCategoriesWithCounts() });
}

export async function createCategory(req, res) {
  res.status(201).json({ success: true, data: await blogService.createCategory(req.body ?? {}) });
}

export async function updateCategory(req, res) {
  res.json({ success: true, data: await blogService.updateCategory(req.params.id, req.body ?? {}) });
}

export async function removeCategory(req, res) {
  await blogService.deleteCategory(req.params.id);
  res.json({ success: true, message: 'Category deleted' });
}
