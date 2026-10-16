import * as appointmentService from './appointment.service.js';
import * as slotPlanService from './slotPlan.service.js';

/* Public */

export async function days(req, res) {
  res.json({ success: true, data: await appointmentService.getAvailableDays(req.query.doctor) });
}

export async function slots(req, res) {
  res.json({ success: true, data: await appointmentService.getDaySlots(req.query.doctor, req.query.date) });
}

export async function book(req, res) {
  res.status(201).json({ success: true, data: await appointmentService.createAppointment(req.body ?? {}) });
}

/* Admin: bookings */

export async function list(req, res) {
  res.json({ success: true, data: await appointmentService.listAppointments(req.query) });
}

export async function adminSlots(req, res) {
  const { doctor, date, exclude } = req.query;
  res.json({ success: true, data: await appointmentService.getAdminDaySlots(doctor, date, exclude) });
}

export async function update(req, res) {
  res.json({ success: true, data: await appointmentService.updateAppointment(req.params.id, req.body ?? {}) });
}

export async function reschedule(req, res) {
  res.json({ success: true, data: await appointmentService.rescheduleAppointment(req.params.id, req.body ?? {}) });
}

/* Admin: leave & holidays */

export async function listLeaves(req, res) {
  res.json({ success: true, data: await appointmentService.listLeaves(req.query) });
}

export async function createLeave(req, res) {
  res.status(201).json({ success: true, data: await appointmentService.createLeave(req.body ?? {}) });
}

export async function removeLeave(req, res) {
  await appointmentService.deleteLeave(req.params.id);
  res.json({ success: true, message: 'Leave entry deleted' });
}

/* Admin: slot plans */

export async function listPlans(req, res) {
  res.json({ success: true, data: await slotPlanService.listPlans() });
}

export async function getPlan(req, res) {
  res.json({ success: true, data: await slotPlanService.getPlanById(req.params.id) });
}

export async function createPlan(req, res) {
  res.status(201).json({ success: true, data: await slotPlanService.createPlan(req.body ?? {}) });
}

export async function updatePlan(req, res) {
  res.json({ success: true, data: await slotPlanService.updatePlan(req.params.id, req.body ?? {}) });
}

export async function removePlan(req, res) {
  res.json({ success: true, data: await slotPlanService.deletePlan(req.params.id) });
}

export async function assignPlan(req, res) {
  res.json({ success: true, data: await slotPlanService.assignPlan(req.params.id, req.body ?? {}) });
}
