import mongoose from 'mongoose';

export const ENQUIRY_STATUSES = ['new', 'contacted', 'closed'];
// Which website form it was sent from: the contact page, the home page's "Send a Message" section,
// the "Enquiry Form" on a specialty page, or the same form on the doctors page
export const ENQUIRY_SOURCES = ['contact', 'home', 'specialty', 'doctors'];

// A submission of the website's contact form. Department and doctor names are copied in,
// so an enquiry still reads correctly after the department or doctor is renamed or deleted.
const enquirySchema = new mongoose.Schema(
  {
    fullName: { type: String, required: [true, 'Enter your full name'], trim: true, maxlength: 100 },
    phone: {
      type: String,
      required: [true, 'Enter your mobile number'],
      trim: true,
      match: [/^\+?[0-9][0-9\s-]{8,18}[0-9]$/, 'Enter a valid mobile number'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: '',
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    preferredDate: { type: Date, default: null },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    departmentName: { type: String, trim: true, default: '' },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
    doctorName: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, maxlength: 2000, default: '' },
    source: { type: String, enum: ENQUIRY_SOURCES, default: 'contact' },
    // Specialty forms: the page's specialty in English, e.g. "Hernia Surgery"
    page: { type: String, trim: true, maxlength: 120, default: '' },
    status: { type: String, enum: ENQUIRY_STATUSES, default: 'new' },
    adminNote: { type: String, trim: true, maxlength: 1000, default: '' },
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

enquirySchema.index({ status: 1, createdAt: -1 });
enquirySchema.index({ source: 1, createdAt: -1 });

const Enquiry = mongoose.model('Enquiry', enquirySchema);

export default Enquiry;
