import mongoose from 'mongoose';
import { localized, maxItems } from '../../shared/utils/schemas.js';

// Videos the admin can replace from Settings → Website videos. '' = the website uses its built-in default.
export const VIDEO_KEYS = ['intro', 'hero'];

// Pages whose top banner image the admin can replace from Settings → Page banners. '' = the page's built-in image.
// Must match PAGE_BANNERS in the website's features/site/pageBanners.js.
export const PAGE_BANNER_KEYS = [
  'about', 'doctors', 'contact', 'blogs', 'bookAppointment', 'appointmentBooking', 'research', 'caseStudies',
  'emergency', 'diagnosis', 'radiology',
  'laparoscopic', 'roboticSurgery', 'cancer', 'hernia', 'orthopaedics', 'generalSurgery', 'gastrointestinal',
  'physiotherapy', 'anaesthesia', 'plasticSurgery', 'urology', 'generalInternal', 'gynaecology',
];

// Icons the website can show next to a home header stat
export const STAT_ICONS = ['operations', 'experience', 'patients', 'doctors', 'beds', 'heart', 'ambulance', 'award'];
export const MAX_HERO_STATS = 6;

// One number in the stats bar at the bottom of the home page header, e.g. "15,000+ Total Successful Operations"
const heroStatSchema = new mongoose.Schema(
  {
    icon: { type: String, enum: STAT_ICONS, default: 'operations' },
    value: { type: String, trim: true, required: [true, 'Enter the number, e.g. 15,000+'], maxlength: 20 },
    label: { type: localized(60, true), default: () => ({}) },
  },
  { _id: false },
);

// One image URL per page in PAGE_BANNER_KEYS
const pageBannersSchema = new mongoose.Schema(
  Object.fromEntries(PAGE_BANNER_KEYS.map((key) => [key, { type: String, default: '' }])),
  { _id: false },
);

// One document holding site-wide settings
const siteSettingSchema = new mongoose.Schema(
  {
    // Full-screen welcome video shown the first time a visitor opens the home page
    introVideo: { type: String, default: '' },
    // Background video of the home page header (hero) section
    heroVideo: { type: String, default: '' },
    // Home header stats bar. Empty = the website shows its built-in numbers.
    heroStats: { type: [heroStatSchema], default: [], validate: maxItems(MAX_HERO_STATS) },
    // Top banner image of each inner page
    pageBanners: { type: pageBannersSchema, default: () => ({}) },
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

const SiteSetting = mongoose.model('SiteSetting', siteSettingSchema);

export default SiteSetting;
