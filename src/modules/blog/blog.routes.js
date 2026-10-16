import { Router } from 'express';
import * as blogController from './blog.controller.js';
import { COVER_FOLDER } from './blog.service.js';
import { protect } from '../../shared/middlewares/auth.js';
import { imageUpload } from '../../shared/middlewares/upload.js';

const COVER_MAX_MB = 5;

// Website: published articles + categories (Redis first, then MongoDB)
export const publicBlogRoutes = Router();
publicBlogRoutes.get('/', blogController.listPublic);
publicBlogRoutes.get('/:slug', blogController.getPublic);

// Admin panel: articles (drafts included)
export const adminBlogRoutes = Router();
adminBlogRoutes.use(protect);
adminBlogRoutes.get('/', blogController.list);
adminBlogRoutes.post('/', blogController.create);
adminBlogRoutes.get('/:id', blogController.getById);
adminBlogRoutes.patch('/:id', blogController.update);
adminBlogRoutes.delete('/:id', blogController.remove);
adminBlogRoutes.post('/:id/cover', imageUpload(COVER_FOLDER, 'cover', COVER_MAX_MB), blogController.uploadCover);
adminBlogRoutes.delete('/:id/cover', blogController.removeCover);

// Admin panel: blog categories
export const adminBlogCategoryRoutes = Router();
adminBlogCategoryRoutes.use(protect);
adminBlogCategoryRoutes.get('/', blogController.listCategories);
adminBlogCategoryRoutes.post('/', blogController.createCategory);
adminBlogCategoryRoutes.patch('/:id', blogController.updateCategory);
adminBlogCategoryRoutes.delete('/:id', blogController.removeCategory);
