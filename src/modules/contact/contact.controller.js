import * as contactService from './contact.service.js';

/* Public */

export async function listPublicDepartments(req, res) {
  res.json({ success: true, data: await contactService.listPublicDepartments() });
}

export async function submitEnquiry(req, res) {
  res.status(201).json({ success: true, data: await contactService.createEnquiry(req.body ?? {}) });
}

/* Admin: departments */

export async function listDepartments(req, res) {
  res.json({ success: true, data: await contactService.listDepartmentsWithCounts() });
}

export async function createDepartment(req, res) {
  res.status(201).json({ success: true, data: await contactService.createDepartment(req.body ?? {}) });
}

export async function updateDepartment(req, res) {
  res.json({ success: true, data: await contactService.updateDepartment(req.params.id, req.body ?? {}) });
}

export async function removeDepartment(req, res) {
  await contactService.deleteDepartment(req.params.id);
  res.json({ success: true, message: 'Department deleted' });
}

/* Admin: enquiries */

export async function listEnquiries(req, res) {
  res.json({ success: true, data: await contactService.listEnquiries() });
}

export async function updateEnquiry(req, res) {
  res.json({ success: true, data: await contactService.updateEnquiry(req.params.id, req.body ?? {}) });
}

export async function removeEnquiry(req, res) {
  await contactService.deleteEnquiry(req.params.id);
  res.json({ success: true, message: 'Enquiry deleted' });
}
