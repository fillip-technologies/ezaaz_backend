import * as patientService from './patient.service.js';
import { sendReport } from '../whatsapp/whatsapp.service.js';

/* Patients */

export async function list(req, res) {
  res.json({ success: true, data: await patientService.listPatients(req.query) });
}

export async function get(req, res) {
  res.json({ success: true, data: await patientService.getPatient(req.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ success: true, data: await patientService.createPatient(req.body ?? {}, req.admin) });
}

export async function update(req, res) {
  res.json({ success: true, data: await patientService.updatePatient(req.params.id, req.body ?? {}, req.admin) });
}

/* Visits */

export async function createVisit(req, res) {
  res.status(201).json({ success: true, data: await patientService.createVisit(req.params.id, req.body ?? {}, req.admin) });
}

export async function updateVisit(req, res) {
  res.json({ success: true, data: await patientService.updateVisit(req.params.id, req.body ?? {}) });
}

export async function removeVisit(req, res) {
  await patientService.deleteVisit(req.params.id);
  res.json({ success: true, message: 'Visit deleted' });
}

/* Reports */

export async function createReport(req, res) {
  res.status(201).json({ success: true, data: await patientService.createReport(req.params.id, req.file, req.body ?? {}, req.admin) });
}

// Sends the private file; ?inline=1 opens it in the browser instead of downloading
export async function reportFile(req, res) {
  const file = await patientService.reportFile(req.params.id);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(file.mime);
  const disposition = req.query.inline ? 'inline' : 'attachment';
  res.set('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  res.send(file.buffer);
}

export async function updateReport(req, res) {
  res.json({ success: true, data: await patientService.updateReport(req.params.id, req.body ?? {}) });
}

export async function removeReport(req, res) {
  await patientService.deleteReport(req.params.id);
  res.json({ success: true, message: 'Report deleted' });
}

// Returns { method: 'document' | 'template' | 'notice', message }
export async function sendReportOnWhatsApp(req, res) {
  res.json({ success: true, data: await sendReport(req.params.id, req.admin) });
}
