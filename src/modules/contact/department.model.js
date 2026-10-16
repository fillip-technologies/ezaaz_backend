import mongoose from 'mongoose';
import { localized, SLUG_PATTERN } from '../../shared/utils/schemas.js';

// Departments = the "Department / Specialty" dropdown on the website's contact form
const departmentSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60, match: SLUG_PATTERN },
    name: { type: localized(120, true), default: () => ({}) },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
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

const Department = mongoose.model('Department', departmentSchema);

export default Department;
