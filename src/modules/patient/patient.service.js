import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Patient, { nameKeyOf } from './patient.model.js';
import Visit from './visit.model.js';
import Report, { REPORT_FOLDER, REPORT_TYPES } from './report.model.js';
import Appointment from '../appointment/appointment.model.js';
import Doctor from '../doctor/doctor.model.js';
import Conversation from '../whatsapp/conversation.model.js';
import { toWhatsAppNumber } from '../../config/whatsapp.js';
import ApiError from '../../shared/utils/ApiError.js';
import { privateFilePath, removePrivateFile } from '../../shared/middlewares/upload.js';

const PATIENT_FIELDS = ['name', 'phone', 'email', 'dob', 'age', 'gender', 'address', 'bloodGroup', 'allergies', 'chronicConditions', 'language', 'notes'];
const VISIT_FIELDS = ['date', 'chiefComplaint', 'vitals', 'diagnosis', 'prescription', 'advice', 'followUpDate'];

const isObjectId = (v) => mongoose.isValidObjectId(v) && String(new mongoose.Types.ObjectId(String(v))) === String(v);
const invalid = (field, message) => new ApiError(400, 'Validation failed', [{ field, message }]);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pick(body, fields) {
  const data = {};
  for (const key of fields) if (body[key] !== undefined) data[key] = body[key];
  return data;
}

function generateUhid() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `EJZ-P-${[...crypto.randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join('')}`;
}

// Saves a new patient, retrying on the (unlikely) chance its random UHID is taken
async function createWithUhid(data) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await Patient.create({ ...data, uhid: generateUhid() });
    } catch (err) {
      if (err.code !== 11000 || !err.keyPattern?.uhid || attempt >= 3) throw err;
    }
  }
}

// The patient's chat (if any) lists them in its side panel
const linkConversation = (patient) =>
  patient.waId ? Conversation.updateOne({ waId: patient.waId }, { $addToSet: { patients: patient._id } }) : Promise.resolve();

/* ------------------------------ From bookings ------------------------------ */

// Same number + same name = same patient; a different name on the number is another family member
export async function findOrCreateForBooking(a) {
  const waId = toWhatsAppNumber(a.phone) || '';
  const nameKey = nameKeyOf(a.patientName);
  const phoneKey = String(a.phone).replace(/\D/g, '').slice(-10);
  let patient = await Patient.findOne(waId ? { waId, nameKey } : { phoneKey, nameKey });
  if (!patient) {
    patient = await createWithUhid({
      name: a.patientName,
      phone: a.phone,
      waId,
      email: a.email || '',
      age: a.age ?? null,
      gender: a.gender,
      language: a.language || 'en',
      consent: { whatsapp: { at: new Date(), source: 'booking_form' } },
    });
  } else {
    // Keep the record current with what the patient just entered
    if (a.email) patient.email = a.email;
    if (a.age !== undefined && a.age !== null) patient.age = a.age;
    if (a.gender) patient.gender = a.gender;
    if (a.language) patient.language = a.language;
    if (!patient.consent?.whatsapp?.at) patient.set('consent.whatsapp', { at: new Date(), source: 'booking_form' });
    await patient.save();
  }
  await linkConversation(patient);
  return patient;
}

/* --------------------------------- Admin --------------------------------- */

export async function listPatients({ q = '', limit = 50 } = {}) {
  const search = String(q || '').trim().slice(0, 60);
  const filter = {};
  if (search) {
    const digits = search.replace(/\D/g, '');
    filter.$or = [{ nameKey: { $regex: escapeRegex(nameKeyOf(search)) } }, { uhid: { $regex: escapeRegex(search.toUpperCase()) } }];
    if (digits.length >= 4) filter.$or.push({ phoneKey: { $regex: escapeRegex(digits.slice(-10)) } });
  }
  return Patient.find(filter).sort({ updatedAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
}

async function getPatientDoc(id) {
  const patient = isObjectId(id) && (await Patient.findById(id));
  if (!patient) throw ApiError.notFound('Patient not found');
  return patient;
}

// Profile + full history: bookings, visits, reports and the WhatsApp chat
export async function getPatient(id) {
  const patient = await getPatientDoc(id);
  const [appointments, visits, reports, conversation] = await Promise.all([
    Appointment.find({ patient: patient._id }).select('-phoneKey -__v').sort({ date: -1, time: -1 }).limit(200).lean(),
    Visit.find({ patient: patient._id }).sort({ date: -1, createdAt: -1 }).lean(),
    Report.find({ patient: patient._id }).select('-file.storedName').sort({ createdAt: -1 }).lean(),
    patient.waId ? Conversation.findOne({ waId: patient.waId }).select('_id optedOut lastInboundAt unreadCount').lean() : null,
  ]);
  return { patient, appointments, visits, reports, conversation };
}

// "WhatsApp messages to this number" off = the same as the patient replying STOP: nothing is sent to the number
// (bookings, reminders, reports) until it's switched back on or they send START. It covers everyone on the number.
async function setNumberOptOut(patient, optedOut) {
  if (!patient.waId) return;
  await Conversation.findOneAndUpdate(
    { waId: patient.waId },
    { $set: { optedOut, optedOutAt: optedOut ? new Date() : null }, $setOnInsert: { displayName: patient.name } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

// Desk-only changes: reportsConsent (true/false), whatsappConsent (true/false, per number), phoneVerified (true)
function applyDeskFlags(patient, body, admin) {
  if (body.reportsConsent !== undefined) {
    patient.set('consent.reports', body.reportsConsent ? { at: new Date(), source: 'desk', by: admin?._id ?? null } : { at: null, source: '', by: null });
  }
  if (body.whatsappConsent !== undefined) {
    patient.set('consent.whatsapp', body.whatsappConsent ? { at: new Date(), source: 'desk', by: admin?._id ?? null } : { at: null, source: '', by: null });
  }
  if (body.phoneVerified === true) {
    patient.phoneVerifiedAt = new Date();
    patient.phoneVerifiedBy = 'desk';
  }
}

export async function createPatient(body, admin) {
  const data = pick(body, PATIENT_FIELDS);
  if (data.age === '') data.age = null;
  data.waId = toWhatsAppNumber(data.phone) || '';
  const desk = { at: new Date(), source: 'desk', by: admin?._id ?? null };
  data.consent = { whatsapp: body.whatsappConsent ? desk : {}, reports: body.reportsConsent ? desk : {} };
  if (body.phoneVerified === true) Object.assign(data, { phoneVerifiedAt: new Date(), phoneVerifiedBy: 'desk' });
  const patient = await createWithUhid(data);
  if (body.whatsappConsent === false) await setNumberOptOut(patient, true);
  await linkConversation(patient);
  return patient;
}

export async function updatePatient(id, body, admin) {
  const patient = await getPatientDoc(id);
  const data = pick(body, PATIENT_FIELDS);
  if (data.age === '') data.age = null;
  patient.set(data);
  if (data.phone !== undefined) {
    const waId = toWhatsAppNumber(data.phone) || '';
    if (waId !== patient.waId) {
      patient.waId = waId;
      patient.phoneVerifiedAt = null; // a new number has to be confirmed again
      patient.phoneVerifiedBy = '';
    }
  }
  applyDeskFlags(patient, body, admin);
  await patient.save();
  if (body.whatsappConsent !== undefined) await setNumberOptOut(patient, !body.whatsappConsent);
  await linkConversation(patient);
  return patient;
}

/* ---------------------------------- Visits ---------------------------------- */

async function visitData(body) {
  const data = pick(body, VISIT_FIELDS);
  if (Array.isArray(data.prescription)) data.prescription = data.prescription.filter((p) => String(p?.medicine || '').trim());
  if (body.doctor !== undefined) {
    if (!body.doctor) {
      data.doctor = null;
      data.doctorName = String(body.doctorName || '').trim();
    } else {
      const doctor = isObjectId(body.doctor) && (await Doctor.findById(body.doctor).select('name').lean());
      if (!doctor) throw invalid('doctor', 'Choose a valid doctor');
      data.doctor = doctor._id;
      data.doctorName = doctor.name.en;
    }
  }
  return data;
}

export async function createVisit(patientId, body, admin) {
  const patient = await getPatientDoc(patientId);
  const data = await visitData(body);
  if (body.appointment) {
    const appointment = isObjectId(body.appointment) && (await Appointment.findOne({ _id: body.appointment, patient: patient._id }).lean());
    if (!appointment) throw invalid('appointment', 'Choose one of this patient’s appointments');
    data.appointment = appointment._id;
    if (data.doctor === undefined) Object.assign(data, { doctor: appointment.doctor, doctorName: appointment.doctorName });
    if (!data.date) data.date = appointment.date;
  }
  const visit = await Visit.create({ ...data, patient: patient._id, createdBy: admin?._id ?? null });
  await Patient.updateOne({ _id: patient._id }, { $set: { updatedAt: new Date() } });
  return visit;
}

async function getVisitDoc(id) {
  const visit = isObjectId(id) && (await Visit.findById(id));
  if (!visit) throw ApiError.notFound('Visit not found');
  return visit;
}

export async function updateVisit(id, body) {
  const visit = await getVisitDoc(id);
  visit.set(await visitData(body));
  await visit.save();
  return visit;
}

export async function deleteVisit(id) {
  const visit = await getVisitDoc(id);
  await Report.updateMany({ visit: visit._id }, { visit: null });
  await visit.deleteOne();
}

/* --------------------------------- Reports --------------------------------- */

// `file` was saved by privateDocumentUpload into PRIVATE_UPLOAD_DIR/reports
export async function createReport(patientId, file, body, admin) {
  if (!file) throw invalid('file', 'Choose a PDF, JPG or PNG file');
  try {
    const patient = await getPatientDoc(patientId);
    const type = REPORT_TYPES.includes(body.type) ? body.type : 'other';
    const visit = body.visit && isObjectId(body.visit) ? await Visit.findOne({ _id: body.visit, patient: patient._id }).select('_id appointment').lean() : null;
    const report = await Report.create({
      patient: patient._id,
      visit: visit?._id ?? null,
      appointment: visit?.appointment ?? null,
      type,
      title: String(body.title || '').trim() || file.originalname,
      reportDate: body.reportDate || '',
      notes: String(body.notes || ''),
      file: { storedName: file.filename, mime: file.mimetype, size: file.size, originalName: String(file.originalname || '').slice(0, 200) },
      uploadedBy: admin?._id ?? null,
    });
    await Patient.updateOne({ _id: patient._id }, { $set: { updatedAt: new Date() } });
    return report;
  } catch (err) {
    await removePrivateFile(REPORT_FOLDER, file.filename);
    throw err;
  }
}

async function getReportDoc(id) {
  const report = isObjectId(id) && (await Report.findById(id));
  if (!report) throw ApiError.notFound('Report not found');
  return report;
}

export async function reportFile(id) {
  const report = await getReportDoc(id);
  const ext = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[report.file.mime] || '';
  return {
    path: privateFilePath(REPORT_FOLDER, report.file.storedName),
    mime: report.file.mime,
    filename: `${report.title.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim() || 'report'}${ext}`,
  };
}

export async function updateReport(id, body) {
  const report = await getReportDoc(id);
  if (body.title !== undefined) report.title = String(body.title);
  if (body.type !== undefined) report.type = REPORT_TYPES.includes(body.type) ? body.type : 'other';
  if (body.reportDate !== undefined) report.reportDate = body.reportDate || '';
  if (body.notes !== undefined) report.notes = String(body.notes);
  await report.save();
  return report;
}

export async function deleteReport(id) {
  const report = await getReportDoc(id);
  await report.deleteOne();
  await removePrivateFile(REPORT_FOLDER, report.file.storedName);
}
