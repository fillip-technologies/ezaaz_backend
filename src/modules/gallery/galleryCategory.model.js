import mongoose from 'mongoose';
import { localized, SLUG_PATTERN } from '../../shared/utils/schemas.js';

// Gallery categories = the filter tabs on the website's photo gallery page
const galleryCategorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60, match: SLUG_PATTERN },
    name: { type: localized(80, true), default: () => ({}) },
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

const GalleryCategory = mongoose.model('GalleryCategory', galleryCategorySchema);

export default GalleryCategory;
