import mongoose from 'mongoose';

// { en, hi } text. English can be required; Hindi is optional and the website falls back to English.
export const localized = (maxlength, required = false) =>
  new mongoose.Schema(
    {
      en: { type: String, trim: true, maxlength, required },
      hi: { type: String, trim: true, maxlength, default: '' },
    },
    { _id: false },
  );

export const maxItems = (max) => ({
  validator: (list) => list.length <= max,
  message: `At most ${max} items are allowed`,
});

export const SLUG_PATTERN = [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only'];

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Returns `base`, or `base-2`, `base-3`… — the first slug not used by another document of `Model`
export async function uniqueSlug(Model, base, ignoreId) {
  const root = base || 'item';
  let candidate = root;
  for (let n = 2; await Model.exists({ slug: candidate, ...(ignoreId && { _id: { $ne: ignoreId } }) }); n++) {
    candidate = `${root}-${n}`;
  }
  return candidate;
}
