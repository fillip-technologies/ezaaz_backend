import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as appointmentController from './appointment.controller.js';
import { protect } from '../../shared/middlewares/auth.js';

// Stops one visitor from filling a doctor's day with fake bookings
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many booking attempts. Please try again later or call us.' },
});

// Website: live availability (never cached) + booking
export const publicAppointmentRoutes = Router();
publicAppointmentRoutes.get('/days', appointmentController.days);
publicAppointmentRoutes.get('/slots', appointmentController.slots);
publicAppointmentRoutes.post('/', bookingLimiter, appointmentController.book);

// Admin panel: bookings
export const adminAppointmentRoutes = Router();
adminAppointmentRoutes.use(protect);
adminAppointmentRoutes.get('/', appointmentController.list);
adminAppointmentRoutes.get('/slots', appointmentController.adminSlots);
adminAppointmentRoutes.patch('/:id', appointmentController.update);
adminAppointmentRoutes.post('/:id/reschedule', appointmentController.reschedule);

// Admin panel: doctor leave and hospital holidays
export const adminLeaveRoutes = Router();
adminLeaveRoutes.use(protect);
adminLeaveRoutes.get('/', appointmentController.listLeaves);
adminLeaveRoutes.post('/', appointmentController.createLeave);
adminLeaveRoutes.delete('/:id', appointmentController.removeLeave);

// Admin panel: reusable schedules that can be assigned to many doctors
export const adminSlotPlanRoutes = Router();
adminSlotPlanRoutes.use(protect);
adminSlotPlanRoutes.get('/', appointmentController.listPlans);
adminSlotPlanRoutes.post('/', appointmentController.createPlan);
adminSlotPlanRoutes.get('/:id', appointmentController.getPlan);
adminSlotPlanRoutes.patch('/:id', appointmentController.updatePlan);
adminSlotPlanRoutes.delete('/:id', appointmentController.removePlan);
adminSlotPlanRoutes.post('/:id/assign', appointmentController.assignPlan);
