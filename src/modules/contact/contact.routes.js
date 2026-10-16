import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as contactController from './contact.controller.js';
import { protect } from '../../shared/middlewares/auth.js';

// Stops one visitor from flooding the enquiries list
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later or call us' },
});

// Website: active departments for the dropdown
export const publicDepartmentRoutes = Router();
publicDepartmentRoutes.get('/', contactController.listPublicDepartments);

// Website: contact form submission
export const publicContactRoutes = Router();
publicContactRoutes.post('/', submitLimiter, contactController.submitEnquiry);

// Admin panel: departments
export const adminDepartmentRoutes = Router();
adminDepartmentRoutes.use(protect);
adminDepartmentRoutes.get('/', contactController.listDepartments);
adminDepartmentRoutes.post('/', contactController.createDepartment);
adminDepartmentRoutes.patch('/:id', contactController.updateDepartment);
adminDepartmentRoutes.delete('/:id', contactController.removeDepartment);

// Admin panel: contact form submissions
export const adminEnquiryRoutes = Router();
adminEnquiryRoutes.use(protect);
adminEnquiryRoutes.get('/', contactController.listEnquiries);
adminEnquiryRoutes.patch('/:id', contactController.updateEnquiry);
adminEnquiryRoutes.delete('/:id', contactController.removeEnquiry);
