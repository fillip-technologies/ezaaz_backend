import { Router } from 'express';
import * as siteController from './site.controller.js';
import { PAGE_BANNER_KEYS, VIDEO_KEYS } from './site.model.js';
import { MEDIA_FOLDER } from './site.service.js';
import { protect } from '../../shared/middlewares/auth.js';
import { imageUpload, videoUpload } from '../../shared/middlewares/upload.js';
import ApiError from '../../shared/utils/ApiError.js';

// The built-in home header video is already ~40 MB
export const SITE_VIDEO_MAX_MB = 100;
// Wide banner photos (~1920px) are bigger than the usual 3 MB photo limit
export const PAGE_BANNER_MAX_MB = 5;

// Runs before the upload so an unknown key never writes a file
function checkVideoKey(req, res, next) {
  if (!VIDEO_KEYS.includes(req.params.key)) throw ApiError.notFound(`Unknown video "${req.params.key}"`);
  next();
}

function checkBannerKey(req, res, next) {
  if (!PAGE_BANNER_KEYS.includes(req.params.key)) throw ApiError.notFound(`Unknown page "${req.params.key}"`);
  next();
}

// Website: which videos to play
export const publicSiteRoutes = Router();
publicSiteRoutes.get('/', siteController.getPublic);

// Admin panel: Settings → Website videos / Home page stats / Page banners
export const adminSiteRoutes = Router();
adminSiteRoutes.use(protect);
adminSiteRoutes.get('/', siteController.get);
adminSiteRoutes.post('/videos/:key', checkVideoKey, videoUpload(MEDIA_FOLDER, 'video', SITE_VIDEO_MAX_MB), siteController.uploadVideo);
adminSiteRoutes.delete('/videos/:key', checkVideoKey, siteController.resetVideo);
adminSiteRoutes.put('/hero-stats', siteController.updateHeroStats);
adminSiteRoutes.post('/banners/:key', checkBannerKey, imageUpload(MEDIA_FOLDER, 'image', PAGE_BANNER_MAX_MB), siteController.uploadPageBanner);
adminSiteRoutes.delete('/banners/:key', checkBannerKey, siteController.resetPageBanner);
