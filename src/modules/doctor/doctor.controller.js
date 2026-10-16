import * as doctorService from './doctor.service.js';

/* Public */

export async function listPublic(req, res) {
  const { doctors, source } = await doctorService.listPublicDoctors();
  res.set('X-Cache', source === 'cache' ? 'HIT' : 'MISS');
  res.json({ success: true, data: doctors });
}

export async function getPublic(req, res) {
  const { doctor, source } = await doctorService.getPublicDoctor(req.params.slug);
  res.set('X-Cache', source === 'cache' ? 'HIT' : 'MISS');
  res.json({ success: true, data: doctor });
}

/* Admin */

export async function list(req, res) {
  const doctors = await doctorService.listAllDoctors();
  res.json({ success: true, data: doctors });
}

export async function getById(req, res) {
  const doctor = await doctorService.getDoctorById(req.params.id);
  res.json({ success: true, data: doctor });
}

export async function create(req, res) {
  const doctor = await doctorService.createDoctor(req.body ?? {});
  res.status(201).json({ success: true, data: doctor });
}

export async function update(req, res) {
  const doctor = await doctorService.updateDoctor(req.params.id, req.body ?? {});
  res.json({ success: true, data: doctor });
}

export async function remove(req, res) {
  await doctorService.deleteDoctor(req.params.id);
  res.json({ success: true, message: 'Doctor deleted' });
}

export async function uploadPhoto(req, res) {
  const doctor = await doctorService.setDoctorPhoto(req.params.id, req.file);
  res.json({ success: true, data: doctor });
}

export async function removePhoto(req, res) {
  const doctor = await doctorService.removeDoctorPhoto(req.params.id);
  res.json({ success: true, data: doctor });
}
