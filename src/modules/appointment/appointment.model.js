import mongoose from 'mongoose';
import { TIME_PATTERN } from '../doctor/doctor.model.js';

export const DATE_PATTERN = [/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Use a YYYY-MM-DD date'];

// Bookings are confirmed the moment they are made; there is no 'requested' step
export const APPOINTMENT_STATUSES = ['confirmed', 'completed', 'cancelled', 'no_show'];
// Statuses that hold the time slot. Only cancelling (a manual admin action) frees it again.
export const ACTIVE_STATUSES = ['confirmed', 'completed', 'no_show'];
export const PATIENT_GENDERS = ['male', 'female', 'other'];

// A booked time slot. `date`/`time` are clinic-local (IST) strings, so they never shift with time zones.
// The doctor's name is copied in so the booking still reads correctly after the doctor is renamed or removed.
const appointmentSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true, unique: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    doctorName: { type: String, trim: true, default: '' },
    date: { type: String, required: true, match: DATE_PATTERN },
    time: { type: String, required: true, match: TIME_PATTERN },

    patientName: { type: String, required: [true, 'Enter the patient name'], trim: true, maxlength: 100 },
    phone: {
      type: String,
      required: [true, 'Enter a mobile number'],
      trim: true,
      match: [/^\+?[0-9][0-9\s-]{8,18}[0-9]$/, 'Enter a valid mobile number'],
    },
    // Last 10 digits of the phone, used to stop the same patient booking a doctor twice on one day
    phoneKey: { type: String, required: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: '',
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    age: { type: Number, min: [0, 'Enter a valid age'], max: [120, 'Enter a valid age'], default: null },
    gender: { type: String, enum: PATIENT_GENDERS, default: 'male' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },

    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'confirmed' },
    // Double-booking guard: each slot has SEATS_PER_SLOT seats, and the unique index below lets
    // only one active booking hold each seat. Cancelling sets `active: false`, which frees the seat.
    active: { type: Boolean, default: true },
    seat: { type: Number, min: 1, required: true },

    adminNote: { type: String, trim: true, maxlength: 1000, default: '' },
    cancelReason: { type: String, trim: true, maxlength: 300, default: '' },
    // Optional day the patient should come instead, set when cancelling and included in the email
    nextVisitDate: { type: String, default: '', match: [new RegExp(`^$|${DATE_PATTERN[0].source}`), DATE_PATTERN[1]] },

    // The patient's record (found or created at booking)
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    // Website language at booking: WhatsApp messages use the Hindi templates for 'hi'
    language: { type: String, enum: ['en', 'hi'], default: 'en' },
    // WhatsApp reminders (each is claimed atomically, so it's sent once even across restarts)
    reminderSentAt: { type: Date, default: null },
    nextVisitReminderSentAt: { type: Date, default: null },
    // Reminder buttons: "I'll be there" / "Need to change"
    patientConfirmedAt: { type: Date, default: null },
    changeRequestedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.phoneKey;
        return ret;
      },
    },
  },
);

appointmentSchema.index(
  { doctor: 1, date: 1, time: 1, seat: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_booking_per_seat' },
);
appointmentSchema.index({ date: 1, time: 1 });
appointmentSchema.index({ status: 1, date: 1 });
appointmentSchema.index({ phoneKey: 1, doctor: 1, date: 1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);

export default Appointment;
