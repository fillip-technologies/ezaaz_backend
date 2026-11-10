import mongoose from 'mongoose';
import { DATE_PATTERN, PATIENT_GENDERS } from '../appointment/appointment.model.js';

export const LANGUAGES = ['en', 'hi'];
export const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Lowercase, single-spaced name: matches "rahul  Kumar" with "Rahul Kumar"
export const nameKeyOf = (name) => String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();

const consentSchema = new mongoose.Schema(
  {
    at: { type: Date, default: null },
    // 'booking_form' | 'desk' | 'whatsapp'
    source: { type: String, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { _id: false },
);

// A person treated at the hospital. Several patients can share one phone (family members),
// so the phone is not unique; `uhid` is the patient's hospital ID.
const patientSchema = new mongoose.Schema(
  {
    uhid: { type: String, required: true, unique: true },
    name: { type: String, required: [true, 'Enter the patient name'], trim: true, maxlength: 100 },
    nameKey: { type: String, required: true },
    phone: {
      type: String,
      required: [true, 'Enter a mobile number'],
      trim: true,
      match: [/^\+?[0-9][0-9\s-]{8,18}[0-9]$/, 'Enter a valid mobile number'],
    },
    // Last 10 digits (links old bookings) and the WhatsApp number (links the chat)
    phoneKey: { type: String, required: true },
    waId: { type: String, default: '' },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: '',
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    dob: { type: String, default: '', match: [new RegExp(`^$|${DATE_PATTERN[0].source}`), DATE_PATTERN[1]] },
    age: { type: Number, min: [0, 'Enter a valid age'], max: [120, 'Enter a valid age'], default: null },
    gender: { type: String, enum: PATIENT_GENDERS, default: 'male' },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, default: '' },
    allergies: { type: String, trim: true, maxlength: 500, default: '' },
    chronicConditions: { type: String, trim: true, maxlength: 500, default: '' },
    language: { type: String, enum: LANGUAGES, default: 'en' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },

    consent: {
      // Booking updates and reminders on WhatsApp
      whatsapp: { type: consentSchema, default: () => ({}) },
      // Reports and prescriptions on WhatsApp: needs the patient's explicit agreement
      reports: { type: consentSchema, default: () => ({}) },
    },
    // The number is known to be the patient's: they messaged from it, or staff checked it at the desk.
    // Report files are only sent to verified numbers.
    phoneVerifiedAt: { type: Date, default: null },
    phoneVerifiedBy: { type: String, default: '' }, // 'whatsapp' | 'desk'
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.nameKey;
        return ret;
      },
    },
  },
);

patientSchema.index({ waId: 1, nameKey: 1 });
patientSchema.index({ phoneKey: 1 });
patientSchema.index({ nameKey: 1 });
patientSchema.index({ updatedAt: -1 });

patientSchema.pre('validate', function setKeys() {
  this.nameKey = nameKeyOf(this.name);
  this.phoneKey = String(this.phone || '').replace(/\D/g, '').slice(-10);
});

const Patient = mongoose.model('Patient', patientSchema);

export default Patient;
