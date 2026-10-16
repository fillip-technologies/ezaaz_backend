import mongoose from 'mongoose';
import { TIME_PATTERN, toMinutes } from '../doctor/doctor.model.js';
import { DATE_PATTERN } from './appointment.model.js';

// Blocks appointment slots on one date: a doctor's leave, or a hospital holiday when `doctor` is empty.
// Empty `from`/`to` blocks the whole day; otherwise only slots starting in [from, to) are blocked.
const leaveSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
    date: { type: String, required: [true, 'Choose a date'], match: DATE_PATTERN },
    from: { type: String, default: '', match: [new RegExp(`^$|${TIME_PATTERN[0].source}`), TIME_PATTERN[1]] },
    to: { type: String, default: '', match: [new RegExp(`^$|${TIME_PATTERN[0].source}`), TIME_PATTERN[1]] },
    reason: { type: String, trim: true, maxlength: 200, default: '' },
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

leaveSchema.pre('validate', function checkTimes() {
  if (Boolean(this.from) !== Boolean(this.to)) {
    this.invalidate(this.from ? 'to' : 'from', 'Enter both times, or leave both empty to block the whole day');
  } else if (this.from && toMinutes(this.from) >= toMinutes(this.to)) {
    this.invalidate('to', 'End time must be after the start time');
  }
});

leaveSchema.index({ date: 1, doctor: 1 });

const Leave = mongoose.model('Leave', leaveSchema);

export default Leave;
