import { Router } from 'express';
import * as galleryController from './gallery.controller.js';
import { MEDIA_FOLDER } from './gallery.service.js';
import { protect } from '../../shared/middlewares/auth.js';
import { imageUpload, imagesUpload, videoUpload } from '../../shared/middlewares/upload.js';

// Camera photos are often 8–12 MB; large videos are better added as YouTube links
export const PHOTO_MAX_MB = 15;
export const PHOTOS_PER_UPLOAD = 20;
export const VIDEO_MAX_MB = 100;

// Website: visible photos, videos and categories (Redis first, then MongoDB)
export const publicGalleryRoutes = Router();
publicGalleryRoutes.get('/', galleryController.getPublic);

// Admin panel: all photos and videos (hidden ones included)
export const adminGalleryRoutes = Router();
adminGalleryRoutes.use(protect);
adminGalleryRoutes.get('/', galleryController.list);
adminGalleryRoutes.post('/photos', imagesUpload(MEDIA_FOLDER, 'photos', PHOTO_MAX_MB, PHOTOS_PER_UPLOAD), galleryController.uploadPhotos);
adminGalleryRoutes.post('/videos', galleryController.createVideo);
adminGalleryRoutes.patch('/reorder', galleryController.reorder);
adminGalleryRoutes.get('/:id', galleryController.getById);
adminGalleryRoutes.patch('/:id', galleryController.update);
adminGalleryRoutes.delete('/:id', galleryController.remove);
adminGalleryRoutes.post('/:id/image', imageUpload(MEDIA_FOLDER, 'image', PHOTO_MAX_MB), galleryController.uploadImage);
adminGalleryRoutes.delete('/:id/image', galleryController.removeImage);
adminGalleryRoutes.post('/:id/video', videoUpload(MEDIA_FOLDER, 'video', VIDEO_MAX_MB), galleryController.uploadVideo);

// Admin panel: photo gallery categories
export const adminGalleryCategoryRoutes = Router();
adminGalleryCategoryRoutes.use(protect);
adminGalleryCategoryRoutes.get('/', galleryController.listCategories);
adminGalleryCategoryRoutes.post('/', galleryController.createCategory);
adminGalleryCategoryRoutes.patch('/:id', galleryController.updateCategory);
adminGalleryCategoryRoutes.delete('/:id', galleryController.removeCategory);
