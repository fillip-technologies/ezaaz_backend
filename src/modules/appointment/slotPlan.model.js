import mongoose from 'mongoose';
import { scheduleSchema } from '../doctor/doctor.model.js';

// A reusable appointment schedule (weekly hours + slot settings) that can be assigned to many doctors at once
const slotPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Enter a plan name'], trim: true, maxlength: 80, unique: true },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    schedule: { type: scheduleSchema, default: () => ({}) },
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

const SlotPlan = mongoose.model('SlotPlan', slotPlanSchema);

export default SlotPlan;
