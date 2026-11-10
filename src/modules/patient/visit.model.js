import mongoose from 'mongoose';
import { DATE_PATTERN } from '../appointment/appointment.model.js';

const optionalDate = { type: String, default: '', match: [new RegExp(`^$|${DATE_PATTERN[0].source}`), DATE_PATTERN[1]] };

const prescriptionSchema = new mongoose.Schema(
  {
    medicine: { type: String, required: [true, 'Enter the medicine'], trim: true, maxlength: 120 },
    dose: { type: String, trim: true, maxlength: 60, default: '' }, // e.g. 500 mg
    frequency: { type: String, trim: true, maxlength: 60, default: '' }, // e.g. 1-0-1 after food
    days: { type: Number, min: 0, max: 365, default: null },
    notes: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

// One consultation: the patient's history is the list of their visits (plus reports)
const visitSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
    doctorName: { type: String, trim: true, default: '' },
    date: { type: String, required: [true, 'Choose the visit date'], match: DATE_PATTERN },

    chiefComplaint: { type: String, trim: true, maxlength: 1000, default: '' },
    vitals: {
      bp: { type: String, trim: true, maxlength: 20, default: '' }, // e.g. 120/80
      pulse: { type: Number, min: 0, max: 300, default: null },
      temperature: { type: Number, min: 80, max: 115, default: null }, // °F
      spo2: { type: Number, min: 0, max: 100, default: null },
      weight: { type: Number, min: 0, max: 400, default: null }, // kg
    },
    diagnosis: { type: String, trim: true, maxlength: 1000, default: '' },
    prescription: { type: [prescriptionSchema], default: [] },
    advice: { type: String, trim: true, maxlength: 2000, default: '' },
    followUpDate: optionalDate,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
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

visitSchema.index({ patient: 1, date: -1 });

const Visit = mongoose.model('Visit', visitSchema);

export default Visit;
