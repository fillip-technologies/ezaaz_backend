import mongoose from 'mongoose';
import { localized } from '../../shared/utils/schemas.js';

export const TYPES = ['photo', 'video'];
// CSS object-position presets: which part of the photo stays visible when a tile crops it
export const POSITIONS = ['center center', 'center top', 'center 20%', 'center 25%', 'center 75%', 'center bottom'];
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// One photo or video on the website's gallery pages (and, with showOnHome, the home page marquee)
const galleryItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, required: true },
    title: { type: localized(200), default: () => ({}) },
    // Small badge on the tile, e.g. "Joint Replacement". Empty = the category name.
    label: { type: localized(80), default: () => ({}) },
    // Photos only; empty = shown under "All Photos" only
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'GalleryCategory', default: null },
    // Photo file, or a video's thumbnail (optional for YouTube: its own thumbnail is used)
    image: { type: String, default: '' },
    position: { type: String, enum: POSITIONS, default: 'center center' },
    // Videos: either an uploaded file or a YouTube video id
    videoFile: { type: String, default: '' },
    youtubeId: {
      type: String,
      trim: true,
      default: '',
      validate: { validator: (v) => !v || YOUTUBE_ID.test(v), message: 'Enter a valid YouTube link' },
    },
    duration: { type: String, trim: true, default: '', match: [/^(?:\d{1,2}:)?\d{1,2}:\d{2}$|^$/, 'Use m:ss or h:mm:ss, e.g. 2:40'] },
    showOnHome: { type: Boolean, default: false },
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

galleryItemSchema.index({ type: 1, order: 1 });
galleryItemSchema.index({ category: 1 });

const GalleryItem = mongoose.model('GalleryItem', galleryItemSchema);

export default GalleryItem;
