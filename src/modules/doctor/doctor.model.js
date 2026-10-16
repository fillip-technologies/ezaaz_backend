import mongoose from 'mongoose';
import { localized, maxItems, SLUG_PATTERN } from '../../shared/utils/schemas.js';

export const CATEGORIES = ['surgical', 'medicine', 'super'];
export const GENDERS = ['male', 'female'];

// Values of the "Select Speciality" filter on the website's book-appointment page
export const SPECIALTY_TAGS = [
  'laparoscopic', 'hernia', 'general-surgery', 'cancer-surgery', 'urology', 'gynaecology',
  'orthopaedics', 'internal-medicine', 'gastrointestinal', 'plastic-surgery', 'physiotherapy', 'anaesthesia',
];

export const TIME_PATTERN = [/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm time, e.g. 09:30'];
export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// One OPD block on a weekday (0 = Sunday … 6 = Saturday). A day can have several, e.g. morning + evening.
const weeklyRangeSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 0, max: 6 },
    start: { type: String, required: true, match: TIME_PATTERN },
    end: { type: String, required: true, match: TIME_PATTERN },
  },
  { _id: false },
);

// Online appointment booking. An empty `weekly` list means the doctor can't be booked online.
// Shared with slot plans (reusable schedules that can be assigned to many doctors).
export const scheduleSchema = new mongoose.Schema(
  {
    slotMinutes: { type: Number, min: 5, max: 120, default: 15 },
    capacity: { type: Number, min: 1, max: 20, default: 1 },
    bookingWindowDays: { type: Number, min: 1, max: 180, default: 30 },
    minNoticeMinutes: { type: Number, min: 0, max: 7 * 24 * 60, default: 60 },
    weekly: {
      type: [weeklyRangeSchema],
      default: [],
      validate: [
        maxItems(50),
        {
          // Each range must end after it starts, and ranges on the same day must not overlap
          validator(ranges) {
            const byDay = new Map();
            for (const r of ranges) {
              if (toMinutes(r.start) >= toMinutes(r.end)) return false;
              byDay.set(r.day, [...(byDay.get(r.day) || []), r]);
            }
            for (const list of byDay.values()) {
              const sorted = list.toSorted((a, b) => toMinutes(a.start) - toMinutes(b.start));
              for (let i = 1; i < sorted.length; i++) {
                if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) return false;
              }
            }
            return true;
          },
          message: 'Each time range must end after it starts, and ranges on the same day must not overlap',
        },
      ],
    },
  },
  { _id: false },
);

const doctorSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
      match: SLUG_PATTERN,
    },
    name: { type: localized(120, true), default: () => ({}) },
    photo: { type: String, default: '' },
    gender: { type: String, enum: GENDERS, required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    specialtyTags: { type: [{ type: String, enum: SPECIALTY_TAGS }], default: [] },
    regNo: { type: String, trim: true, maxlength: 60, default: '' },
    degrees: { type: localized(300), default: () => ({}) },
    specialty: { type: localized(160, true), default: () => ({}) },
    subSpecialty: { type: localized(200), default: () => ({}) },
    department: { type: localized(160), default: () => ({}) },
    experienceYears: { type: Number, min: 0, max: 80, default: 0 },
    languages: { type: String, trim: true, maxlength: 200, default: '' },
    timing: { type: localized(160), default: () => ({}) },
    hospital: { type: localized(200), default: () => ({}) },
    bio: { type: localized(600), default: () => ({}) },
    about: { type: localized(6000), default: () => ({}) },
    specializations: { type: [localized(200, true)], default: [], validate: maxItems(30) },
    education: {
      type: [
        new mongoose.Schema(
          {
            degree: { type: String, trim: true, required: true, maxlength: 200 },
            institution: { type: String, trim: true, maxlength: 200, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
      validate: maxItems(20),
    },
    schedule: { type: scheduleSchema, default: () => ({}) },
    // Slot plan the schedule came from. While `scheduleCustomized` is false, editing the plan updates this doctor too.
    schedulePlan: { type: mongoose.Schema.Types.ObjectId, ref: 'SlotPlan', default: null },
    scheduleCustomized: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

doctorSchema.index({ isActive: 1, order: 1 });

const Doctor = mongoose.model('Doctor', doctorSchema);

export default Doctor;
