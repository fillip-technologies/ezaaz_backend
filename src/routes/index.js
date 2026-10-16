import { Router } from 'express';
import { getDBStatus } from '../config/database.js';
import { cacheStatus } from '../config/cache.js';
import { authRoutes } from '../modules/auth/index.js';
import { publicDoctorRoutes, adminDoctorRoutes } from '../modules/doctor/index.js';
import { publicBlogRoutes, adminBlogRoutes, adminBlogCategoryRoutes } from '../modules/blog/index.js';
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
router.use('/departments', publicDepartmentRoutes);
router.use('/contact', publicContactRoutes);
router.use('/admin/departments', adminDepartmentRoutes);
router.use('/admin/enquiries', adminEnquiryRoutes);
router.use('/appointments', publicAppointmentRoutes);
router.use('/admin/appointments', adminAppointmentRoutes);
router.use('/admin/leaves', adminLeaveRoutes);
router.use('/admin/slot-plans', adminSlotPlanRoutes);

export default router;
