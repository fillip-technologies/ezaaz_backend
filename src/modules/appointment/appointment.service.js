import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Appointment, { ACTIVE_STATUSES, APPOINTMENT_STATUSES } from './appointment.model.js';
import Leave from './leave.model.js';
import Doctor from '../doctor/doctor.model.js';
import env from '../../config/env.js';
import { sendMail } from '../../config/mailer.js';
import ApiError from '../../shared/utils/ApiError.js';
import { addDays, clinicNow, daySlots, daysBetween, isRealDate } from './slots.js';
import * as emails from './appointment.emails.js';

const PATIENT_FIELDS = ['patientName', 'phone', 'email', 'age', 'gender', 'notes'];
const MAX_RANGE_DAYS = 366;

const invalid = (field, message) => new ApiError(400, 'Validation failed', [{ field, message }]);
const slotTaken = () =>
  new ApiError(409, 'That time slot was just booked by someone else. Please choose another.', [
    { field: 'time', code: 'SLOT_TAKEN', message: 'Slot no longer available' },
  ]);
const isObjectId = (v) => mongoose.isValidObjectId(v) && String(new mongoose.Types.ObjectId(String(v))) === String(v);

function checkDate(date, field = 'date') {
  if (!isRealDate(String(date || ''))) throw invalid(field, 'Choose a valid date');
  return String(date);
}

// Emails never block or fail a booking; problems are only logged
function notify(to, message) {
  if (!to) return;
  sendMail({ to, ...message }).catch((err) => console.error(`Appointment email to ${to} failed: ${err.message}`));
}

/* ------------------------------ Slot lookups ------------------------------ */

// Active bookings per 'date|time' and leave entries for one doctor over a date range (2 queries total)
async function loadBookingsAndLeaves(doctorId, from, to, { excludeId } = {}) {
  const [counts, leaves] = await Promise.all([
    Appointment.aggregate([
      { $match: { doctor: doctorId, active: true, date: { $gte: from, $lte: to }, ...(excludeId && { _id: { $ne: excludeId } }) } },
      { $group: { _id: { date: '$date', time: '$time' }, count: { $sum: 1 } } },
    ]),
    Leave.find({ date: { $gte: from, $lte: to }, $or: [{ doctor: doctorId }, { doctor: null }] }).lean(),
  ]);
  const booked = new Map();
  for (const c of counts) {
    if (!booked.has(c._id.date)) booked.set(c._id.date, new Map());
    booked.get(c._id.date).set(c._id.time, c.count);
  }
  return { booked, leaves };
}

async function slotsForDate(doctor, date, options = {}) {
  const { booked, leaves } = await loadBookingsAndLeaves(doctor._id, date, date, options);
  return daySlots({ schedule: doctor.schedule, date, leaves, booked: booked.get(date), admin: options.admin });
}

async function findBookableDoctor(slug) {
  const doctor = await Doctor.findOne({ slug: String(slug || '').toLowerCase(), isActive: true })
    .select('slug name schedule')
    .lean();
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return doctor;
}

const hasSchedule = (doctor) => Boolean(doctor.schedule?.weekly?.length);

/* ----------------------------- Public (website) ----------------------------- */

// Date strip: one entry per day of the doctor's booking window
export async function getAvailableDays(slug) {
  const doctor = await findBookableDoctor(slug);
  const now = clinicNow();
  if (!hasSchedule(doctor)) return { bookable: false, days: [] };

  const windowDays = doctor.schedule.bookingWindowDays || 30;
  const last = addDays(now.date, windowDays - 1);
  const { booked, leaves } = await loadBookingsAndLeaves(doctor._id, now.date, last);

  const days = [];
  for (let i = 0; i < windowDays; i++) {
    const date = addDays(now.date, i);
    const { status, slots } = daySlots({ schedule: doctor.schedule, date, leaves, booked: booked.get(date), now });
    days.push({ date, status, free: slots.filter((s) => s.remaining > 0).length });
  }
  return { bookable: true, capacity: doctor.schedule.capacity, slotMinutes: doctor.schedule.slotMinutes, days };
}

export async function getDaySlots(slug, date) {
  const doctor = await findBookableDoctor(slug);
  if (!hasSchedule(doctor)) return { bookable: false, status: 'closed', slots: [] };
  const result = await slotsForDate(doctor, checkDate(date));
  return { bookable: true, capacity: doctor.schedule.capacity, ...result };
}

function generateRef() {
  // No 0/O/1/I so the reference is easy to read out over the phone
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return `EJZ-${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}`;
}

// Saves `doc` into the first free seat of its slot. The unique (doctor, date, time, seat) index
// on active bookings makes this safe when two people book the last seat at the same moment.
async function claimSeat(doc, capacity) {
  for (let seat = 1; seat <= capacity; seat++) {
    doc.seat = seat;
    doc.active = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await doc.save();
      } catch (err) {
        if (err.code !== 11000) throw err;
        if (err.keyPattern?.ref) {
          doc.ref = generateRef();
          continue;
        }
        break; // seat taken, try the next one
      }
    }
  }
  throw slotTaken();
}

function pickPatient(body) {
  const data = {};
  for (const key of PATIENT_FIELDS) if (body[key] !== undefined && body[key] !== null) data[key] = body[key];
  for (const key of ['patientName', 'phone', 'email', 'notes', 'gender']) if (data[key] !== undefined) data[key] = String(data[key]);
  if (data.gender) data.gender = data.gender.toLowerCase();
  if (data.age === '') delete data.age;
  return data;
}

const phoneKey = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

export async function createAppointment(body) {
  const doctor = await findBookableDoctor(body.doctor);
  if (!hasSchedule(doctor)) throw invalid('doctor', 'Online booking is not available for this doctor. Please call the hospital.');

  const date = checkDate(body.date);
  const time = String(body.time || '');
  const { slots } = await slotsForDate(doctor, date);
  const slot = slots.find((s) => s.time === time);
  if (!slot) throw invalid('time', 'This time is not available. Please choose another slot.');
  if (slot.remaining <= 0) throw slotTaken();

  const patient = pickPatient(body);
  const key = phoneKey(patient.phone);
  if (key.length < 10) throw invalid('phone', 'Enter a valid 10-digit mobile number');
  if (await Appointment.exists({ phoneKey: key, doctor: doctor._id, date, active: true })) {
    throw new ApiError(409, 'You already have an appointment with this doctor on this day. Call us to change it.', [
      { field: 'phone', code: 'DUPLICATE', message: 'Already booked' },
    ]);
  }

  const appointment = new Appointment({
    ...patient,
    phoneKey: key,
    ref: generateRef(),
    doctor: doctor._id,
    doctorName: doctor.name.en,
    date,
    time,
    status: 'requested',
  });
  await claimSeat(appointment, doctor.schedule.capacity || 1);

  notify(appointment.email, emails.requestReceivedEmail(appointment));
  notify(env.APPOINTMENT_NOTIFY_EMAIL, emails.newRequestEmail(appointment));

  return { ref: appointment.ref, doctorName: appointment.doctorName, date, time, status: appointment.status };
}

/* ---------------------------- Admin: bookings ---------------------------- */

export async function listAppointments(query) {
  const filter = {};
  if (query.from || query.to) {
    const from = query.from ? checkDate(query.from, 'from') : '0000-01-01';
    const to = query.to ? checkDate(query.to, 'to') : '9999-12-31';
    if (query.from && query.to && daysBetween(from, to) > MAX_RANGE_DAYS) throw invalid('to', 'Choose a range of one year or less');
    filter.date = { $gte: from, $lte: to };
  }
  if (query.doctor) {
    if (!isObjectId(query.doctor)) throw invalid('doctor', 'Choose a valid doctor');
    filter.doctor = query.doctor;
  }
  return Appointment.find(filter).select('-phoneKey -__v').sort({ date: 1, time: 1, createdAt: 1 }).limit(2000).lean();
}

async function getAppointment(id) {
  const appointment = isObjectId(id) && (await Appointment.findById(id));
  if (!appointment) throw ApiError.notFound('Appointment not found');
  return appointment;
}

// Admin view of a doctor's slots (any future date, no notice period), for rescheduling
export async function getAdminDaySlots(doctorId, date, excludeId) {
  if (!isObjectId(doctorId)) throw invalid('doctor', 'Choose a valid doctor');
  const doctor = await Doctor.findById(doctorId).select('name schedule').lean();
  if (!doctor) throw ApiError.notFound('Doctor not found');
  const excluded = excludeId && isObjectId(excludeId) ? new mongoose.Types.ObjectId(String(excludeId)) : undefined;
  return slotsForDate(doctor, checkDate(date), { admin: true, excludeId: excluded });
}

// Status / note changes. Moving a cancelled booking back to requested/confirmed needs its seat again.
export async function updateAppointment(id, body) {
  const appointment = await getAppointment(id);
  const previous = appointment.status;

  if (body.adminNote !== undefined) appointment.adminNote = String(body.adminNote);
  if (body.cancelReason !== undefined) appointment.cancelReason = String(body.cancelReason);

  if (body.status !== undefined && body.status !== previous) {
    if (!APPOINTMENT_STATUSES.includes(body.status)) throw invalid('status', 'Choose a valid status');
    appointment.status = body.status;
    const willBeActive = ACTIVE_STATUSES.includes(body.status);
    if (willBeActive && !appointment.active) {
      const doctor = await Doctor.findById(appointment.doctor).select('schedule').lean();
      await claimSeat(appointment, doctor?.schedule?.capacity || 1);
    } else {
      appointment.active = willBeActive;
      await appointment.save();
    }
    if (body.status === 'confirmed') notify(appointment.email, emails.confirmedEmail(appointment));
    if (body.status === 'cancelled') notify(appointment.email, emails.cancelledEmail(appointment));
    return appointment;
  }

  await appointment.save();
  return appointment;
}

// Move a booking to another doctor / date / time (re-validated like a new booking, minus the notice period)
export async function rescheduleAppointment(id, body) {
  const appointment = await getAppointment(id);
  const doctorId = body.doctor || String(appointment.doctor);
  if (!isObjectId(doctorId)) throw invalid('doctor', 'Choose a valid doctor');
  const doctor = await Doctor.findById(doctorId).select('name schedule').lean();
  if (!doctor) throw ApiError.notFound('Doctor not found');

  const date = checkDate(body.date);
  const time = String(body.time || '');
  const { slots } = await slotsForDate(doctor, date, { admin: true, excludeId: appointment._id });
  const slot = slots.find((s) => s.time === time);
  if (!slot) throw invalid('time', 'This time is not in the doctor\'s schedule for that day (or is on leave / in the past).');
  if (slot.remaining <= 0) throw slotTaken();

  // Free the old seat first, then claim one in the new slot (restoring the old slot if that fails)
  const old = { doctor: appointment.doctor, doctorName: appointment.doctorName, date: appointment.date, time: appointment.time, seat: appointment.seat, active: appointment.active };
  appointment.active = false;
  await appointment.save();

  Object.assign(appointment, { doctor: doctor._id, doctorName: doctor.name.en, date, time });
  if (!ACTIVE_STATUSES.includes(appointment.status)) appointment.status = 'confirmed';
  try {
    await claimSeat(appointment, doctor.schedule?.capacity || 1);
  } catch (err) {
    Object.assign(appointment, old);
    await appointment.save().catch(() => {});
    throw err;
  }
  notify(appointment.email, emails.rescheduledEmail(appointment));
  return appointment;
}

/* ---------------------------- Admin: leave ---------------------------- */

export async function listLeaves(query) {
  const from = query.from ? checkDate(query.from, 'from') : clinicNow().date;
  return Leave.find({ date: { $gte: from } }).populate('doctor', 'name slug').sort({ date: 1, from: 1 }).lean();
}

// Bookings that fall inside a leave entry and still need to be moved or cancelled
async function bookingsAffectedBy(leave) {
  const filter = { date: leave.date, active: true, ...(leave.doctor && { doctor: leave.doctor }) };
  if (leave.from) filter.time = { $gte: leave.from, $lt: leave.to };
  return Appointment.countDocuments(filter);
}

export async function createLeave(body) {
  const data = {
    doctor: body.doctor || null,
    date: checkDate(body.date),
    from: body.from ? String(body.from) : '',
    to: body.to ? String(body.to) : '',
    reason: body.reason ? String(body.reason) : '',
  };
  if (data.doctor) {
    if (!isObjectId(data.doctor) || !(await Doctor.exists({ _id: data.doctor }))) throw invalid('doctor', 'Choose a valid doctor');
  }
  if (daysBetween(clinicNow().date, data.date) < 0) throw invalid('date', 'Choose today or a future date');
  const leave = await Leave.create(data);
  const affected = await bookingsAffectedBy(leave);
  return { leave: await leave.populate('doctor', 'name slug'), affectedBookings: affected };
}

export async function deleteLeave(id) {
  const leave = isObjectId(id) && (await Leave.findById(id));
  if (!leave) throw ApiError.notFound('Leave entry not found');
  await leave.deleteOne();
}
