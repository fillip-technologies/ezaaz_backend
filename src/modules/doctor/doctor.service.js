import mongoose from 'mongoose';
import Doctor from './doctor.model.js';
import SlotPlan from '../appointment/slotPlan.model.js';
import Appointment from '../appointment/appointment.model.js';
import Leave from '../appointment/leave.model.js';
import { clinicNow, sameSchedule } from '../appointment/slots.js';
import ApiError from '../../shared/utils/ApiError.js';
import { cacheDel, cacheGet, cacheSet } from '../../config/cache.js';
import { publicFileUrl, removeStoredFile } from '../../shared/middlewares/upload.js';
import { slugify, uniqueSlug as uniqueSlugFor } from '../../shared/utils/schemas.js';

export const PHOTO_FOLDER = 'doctors';
export const PUBLIC_LIST_KEY = 'doctors:public:list';

const WRITABLE_FIELDS = [
  'slug', 'name', 'gender', 'category', 'specialtyTags', 'regNo', 'degrees', 'specialty', 'subSpecialty',
  'department', 'experienceYears', 'languages', 'timing', 'hospital', 'bio', 'about',
  'specializations', 'education', 'schedule', 'schedulePlan', 'isActive', 'order',
];

function pickWritable(body) {
  const data = {};
  for (const key of WRITABLE_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (Array.isArray(data.specialtyTags)) data.specialtyTags = [...new Set(data.specialtyTags.map(String))];
  return data;
}

// Keeps the slot-plan link honest: picking a plan without sending hours copies the plan's hours, and
// `scheduleCustomized` is true whenever the doctor's hours differ from their plan's
async function resolveSchedulePlan(data, doctor) {
  if (data.schedule === undefined && data.schedulePlan === undefined) return;
  if (data.schedulePlan === '') data.schedulePlan = null;

  const planId = data.schedulePlan !== undefined ? data.schedulePlan : doctor?.schedulePlan;
  if (!planId) {
    data.scheduleCustomized = false;
    return;
  }
  const plan = mongoose.isValidObjectId(planId) && (await SlotPlan.findById(planId).select('schedule').lean());
  if (!plan) throw new ApiError(400, 'Validation failed', [{ field: 'schedulePlan', message: 'Choose a valid slot plan' }]);

  if (data.schedule === undefined && data.schedulePlan !== undefined) data.schedule = plan.schedule;
  data.scheduleCustomized = !sameSchedule(data.schedule ?? doctor?.schedule, plan.schedule);
}

const uniqueSlug = (base, ignoreId) => uniqueSlugFor(Doctor, base || 'doctor', ignoreId);

// Any admin change drops the cached public list; the next public read refills it from MongoDB
function invalidatePublicCache() {
  return cacheDel(PUBLIC_LIST_KEY);
}

/* ----------------------------- Public (website) ----------------------------- */

// Redis first, then MongoDB. `source` tells the caller where the data came from.
export async function listPublicDoctors() {
  const cached = await cacheGet(PUBLIC_LIST_KEY);
  if (cached) return { doctors: cached, source: 'cache' };

  const doctors = await Doctor.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean();
  const plain = doctors.map(({ __v, ...rest }) => rest);
  await cacheSet(PUBLIC_LIST_KEY, plain);
  return { doctors: plain, source: 'db' };
}

export async function getPublicDoctor(slug) {
  const { doctors, source } = await listPublicDoctors();
  const doctor = doctors.find((d) => d.slug === String(slug).toLowerCase());
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return { doctor, source };
}

/* --------------------------------- Admin --------------------------------- */

export function listAllDoctors() {
  return Doctor.find().sort({ order: 1, createdAt: 1 });
}

export async function getDoctorById(id) {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return doctor;
}

export async function createDoctor(body) {
  const data = pickWritable(body);
  await resolveSchedulePlan(data, null);
  // Auto-generate the URL slug from the English name; a slug typed by the admin must be unique (409 otherwise)
  data.slug = data.slug ? slugify(data.slug) : await uniqueSlug(slugify(data.name?.en));
  if (data.order === undefined) {
    const last = await Doctor.findOne().sort({ order: -1 }).select('order').lean();
    data.order = (last?.order ?? 0) + 1;
  }
  const doctor = await Doctor.create(data);
  await invalidatePublicCache();
  return doctor;
}

export async function updateDoctor(id, body) {
  const doctor = await getDoctorById(id);
  const data = pickWritable(body);
  await resolveSchedulePlan(data, doctor);
  if (data.slug !== undefined) data.slug = slugify(data.slug) || doctor.slug;
  doctor.set(data);
  await doctor.save();
  await invalidatePublicCache();
  return doctor;
}

export async function deleteDoctor(id) {
  const doctor = await getDoctorById(id);
  // Patients with upcoming bookings must be moved first; hiding the doctor stops new bookings instead
  const upcoming = await Appointment.countDocuments({ doctor: doctor._id, active: true, date: { $gte: clinicNow().date } });
  if (upcoming) {
    throw ApiError.conflict(
      `${doctor.name.en} has ${upcoming} upcoming appointment${upcoming === 1 ? '' : 's'}. Reschedule or cancel ${upcoming === 1 ? 'it' : 'them'} in Appointments first, or hide the doctor instead.`,
    );
  }
  await doctor.deleteOne();
  await Leave.deleteMany({ doctor: doctor._id });
  await removeStoredFile(PHOTO_FOLDER, doctor.photo);
  await invalidatePublicCache();
}

export async function setDoctorPhoto(id, file) {
  if (!file) throw ApiError.badRequest('Choose an image to upload (field "photo")');
  let doctor;
  try {
    doctor = await getDoctorById(id);
  } catch (err) {
    await removeStoredFile(PHOTO_FOLDER, file.filename);
    throw err;
  }
  const previous = doctor.photo;
  doctor.photo = publicFileUrl(PHOTO_FOLDER, file.filename);
  await doctor.save();
  await removeStoredFile(PHOTO_FOLDER, previous);
  await invalidatePublicCache();
  return doctor;
}

export async function removeDoctorPhoto(id) {
  const doctor = await getDoctorById(id);
  const previous = doctor.photo;
  doctor.photo = '';
  await doctor.save();
  await removeStoredFile(PHOTO_FOLDER, previous);
  await invalidatePublicCache();
  return doctor;
}
