import mongoose from 'mongoose';
import { DATE_PATTERN } from '../appointment/appointment.model.js';

export const REPORT_TYPES = ['lab', 'radiology', 'prescription', 'discharge_summary', 'bill', 'other'];
export const REPORT_FOLDER = 'reports';

// A WhatsApp send of this report: how it went out and the logged message
const sendSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    // 'document' (chat open) | 'template' (report attached) | 'notice' (asked the patient to tap for it)
    method: { type: String, default: '' },
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  },
  { _id: false },
);

// A file in the patient's record (lab result, scan, prescription, ...). Stored in PRIVATE_UPLOAD_DIR/reports
// and only served to signed-in admins.
const reportSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    type: { type: String, enum: REPORT_TYPES, default: 'lab' },
    title: { type: String, required: [true, 'Enter a title, e.g. CBC blood test report'], trim: true, maxlength: 120 },
    reportDate: { type: String, default: '', match: [new RegExp(`^$|${DATE_PATTERN[0].source}`), DATE_PATTERN[1]] },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    file: {
      storedName: { type: String, required: true },
      mime: { type: String, required: true },
      size: { type: Number, default: 0 },
      originalName: { type: String, default: '' },
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    sends: { type: [sendSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        if (ret.file) delete ret.file.storedName;
        return ret;
      },
    },
  },
);

reportSchema.index({ patient: 1, createdAt: -1 });

const Report = mongoose.model('Report', reportSchema);

export default Report;
