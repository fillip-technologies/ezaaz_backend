import { Router } from 'express';
import * as siteController from './site.controller.js';
import { VIDEO_KEYS } from './site.model.js';
import { MEDIA_FOLDER } from './site.service.js';
import { protect } from '../../shared/middlewares/auth.js';
import { videoUpload } from '../../shared/middlewares/upload.js';
import ApiError from '../../shared/utils/ApiError.js';

// The built-in home header video is already ~40 MB
export const SITE_VIDEO_MAX_MB = 100;

// Runs before the upload so an unknown key never writes a file
function checkVideoKey(req, res, next) {
  if (!VIDEO_KEYS.includes(req.params.key)) throw ApiError.notFound(`Unknown video "${req.params.key}"`);
  next();
}

// Website: which videos to play
export const publicSiteRoutes = Router();
publicSiteRoutes.get('/', siteController.getPublic);

// Admin panel: Settings → Website videos / Home page stats
export const adminSiteRoutes = Router();
adminSiteRoutes.use(protect);
adminSiteRoutes.get('/', siteController.get);
adminSiteRoutes.post('/videos/:key', checkVideoKey, videoUpload(MEDIA_FOLDER, 'video', SITE_VIDEO_MAX_MB), siteController.uploadVideo);
adminSiteRoutes.delete('/videos/:key', checkVideoKey, siteController.resetVideo);
adminSiteRoutes.put('/hero-stats', siteController.updateHeroStats);
