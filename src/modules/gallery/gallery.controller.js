import * as galleryService from './gallery.service.js';

/* Public */

export async function getPublic(req, res) {
  const { data, source } = await galleryService.getPublicGallery();
  res.set('X-Cache', source === 'cache' ? 'HIT' : 'MISS');
  res.json({ success: true, data });
}

/* Admin: photos & videos */

export async function list(req, res) {
  res.json({ success: true, data: await galleryService.listItems() });
}

export async function getById(req, res) {
  res.json({ success: true, data: await galleryService.getItemById(req.params.id) });
}

export async function uploadPhotos(req, res) {
  res.status(201).json({ success: true, data: await galleryService.uploadPhotos(req.files, req.body ?? {}) });
}

export async function createVideo(req, res) {
  res.status(201).json({ success: true, data: await galleryService.createVideo(req.body ?? {}) });
}

export async function update(req, res) {
  res.json({ success: true, data: await galleryService.updateItem(req.params.id, req.body ?? {}) });
}

export async function remove(req, res) {
  await galleryService.deleteItem(req.params.id);
  res.json({ success: true, message: 'Gallery item deleted' });
}

export async function reorder(req, res) {
  await galleryService.reorderItems(req.body);
  res.json({ success: true, message: 'Order saved' });
}

export async function uploadImage(req, res) {
  res.json({ success: true, data: await galleryService.setItemImage(req.params.id, req.file) });
}

export async function removeImage(req, res) {
  res.json({ success: true, data: await galleryService.removeItemImage(req.params.id) });
}

export async function uploadVideo(req, res) {
  res.json({ success: true, data: await galleryService.setItemVideo(req.params.id, req.file) });
}

/* Admin: categories */

export async function listCategories(req, res) {
  res.json({ success: true, data: await galleryService.listCategoriesWithCounts() });
}

export async function createCategory(req, res) {
  res.status(201).json({ success: true, data: await galleryService.createCategory(req.body ?? {}) });
}

export async function updateCategory(req, res) {
  res.json({ success: true, data: await galleryService.updateCategory(req.params.id, req.body ?? {}) });
}

export async function removeCategory(req, res) {
  await galleryService.deleteCategory(req.params.id);
  res.json({ success: true, message: 'Category deleted' });
}
