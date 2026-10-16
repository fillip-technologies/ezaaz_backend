import mongoose from 'mongoose';
import { localized, maxItems, SLUG_PATTERN } from '../../shared/utils/schemas.js';

export const STATUSES = ['draft', 'published'];

// Article body: plain text (rendered with line breaks, never as HTML)
const sectionSchema = new mongoose.Schema(
  {
    heading: { type: localized(200), default: () => ({}) },
    content: { type: localized(10000), default: () => ({}) },
    callout: { type: localized(600), default: () => ({}) },
    bullets: { type: [localized(400, true)], default: [], validate: maxItems(20) },
  },
  { _id: false },
);

const blogSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 100, match: SLUG_PATTERN },
    title: { type: localized(200, true), default: () => ({}) },
    excerpt: { type: localized(600), default: () => ({}) },
    coverImage: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogCategory', required: [true, 'Choose a category'] },
    // Author card on the article comes from this doctor (hidden if the doctor is hidden/deleted)
    authorDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
    publishedAt: { type: Date, default: Date.now },
    // Empty = estimated from the text length
    readTimeMinutes: { type: Number, min: 1, max: 120, default: null },
    status: { type: String, enum: STATUSES, default: 'draft' },
    isFeatured: { type: Boolean, default: false },
    keyHighlights: { type: [localized(400, true)], default: [], validate: maxItems(12) },
    sections: { type: [sectionSchema], default: [], validate: maxItems(30) },
    tags: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      default: [],
      validate: maxItems(15),
    },
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

blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ category: 1 });

// ~200 words per minute over the English text
export function estimateReadTime(blog) {
  const parts = [blog.title?.en, blog.excerpt?.en];
  for (const h of blog.keyHighlights || []) parts.push(h.en);
  for (const s of blog.sections || []) {
    parts.push(s.heading?.en, s.content?.en, s.callout?.en);
    for (const b of s.bullets || []) parts.push(b.en);
  }
  const words = parts.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const Blog = mongoose.model('Blog', blogSchema);

export default Blog;
