import { Router } from 'express';
import { getDBStatus } from '../config/database.js';
import { cacheStatus } from '../config/cache.js';
import { authRoutes } from '../modules/auth/index.js';
import { publicDoctorRoutes, adminDoctorRoutes } from '../modules/doctor/index.js';
import { publicBlogRoutes, adminBlogRoutes, adminBlogCategoryRoutes } from '../modules/blog/index.js';
import { publicGalleryRoutes, adminGalleryRoutes, adminGalleryCategoryRoutes } from '../modules/gallery/index.js';
import {
  publicDepartmentRoutes,
  publicContactRoutes,
  adminDepartmentRoutes,
  adminEnquiryRoutes,
} from '../modules/contact/index.js';
import {
  publicAppointmentRoutes,
  adminAppointmentRoutes,
  adminLeaveRoutes,
  adminSlotPlanRoutes,
} from '../modules/appointment/index.js';
import { publicSiteRoutes, adminSiteRoutes } from '../modules/site/index.js';
import { whatsappWebhookRoutes, adminInboxRoutes } from '../modules/whatsapp/index.js';
import { adminPatientRoutes, adminVisitRoutes, adminReportRoutes } from '../modules/patient/index.js';

const router = Router();

router.get('/health', (req, res) => {
  const db = getDBStatus();
  res.status(db === 'connected' ? 200 : 503).json({ status: 'ok', db, cache: cacheStatus(), uptime: process.uptime() });
});

// Register feature modules here
router.use('/auth', authRoutes);
router.use('/doctors', publicDoctorRoutes);
router.use('/admin/doctors', adminDoctorRoutes);
router.use('/blogs', publicBlogRoutes);
router.use('/admin/blogs', adminBlogRoutes);
router.use('/admin/blog-categories', adminBlogCategoryRoutes);
router.use('/gallery', publicGalleryRoutes);
router.use('/admin/gallery', adminGalleryRoutes);
router.use('/admin/gallery-categories', adminGalleryCategoryRoutes);
router.use('/departments', publicDepartmentRoutes);
router.use('/contact', publicContactRoutes);
router.use('/admin/departments', adminDepartmentRoutes);
router.use('/admin/enquiries', adminEnquiryRoutes);
router.use('/appointments', publicAppointmentRoutes);
router.use('/admin/appointments', adminAppointmentRoutes);
router.use('/admin/leaves', adminLeaveRoutes);
router.use('/admin/slot-plans', adminSlotPlanRoutes);
router.use('/site-settings', publicSiteRoutes);
router.use('/admin/site-settings', adminSiteRoutes);
router.use('/whatsapp/webhook', whatsappWebhookRoutes);
router.use('/admin/inbox', adminInboxRoutes);
router.use('/admin/patients', adminPatientRoutes);
router.use('/admin/visits', adminVisitRoutes);
router.use('/admin/reports', adminReportRoutes);

export default router;
