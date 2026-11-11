import mongoose from 'mongoose';

export const MESSAGE_TYPES = [
  'text', 'template', 'document', 'image', 'audio', 'video', 'sticker', 'location', 'contacts', 'button', 'interactive', 'reaction', 'unsupported',
];
// 'skipped' = never sent (WhatsApp not configured, or the patient opted out)
export const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed', 'skipped', 'received'];
// Delivery receipts can arrive out of order; a status only ever moves forward
export const STATUS_RANK = { queued: 0, sent: 1, delivered: 2, read: 3 };

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    type: { type: String, enum: MESSAGE_TYPES, default: 'text' },
    // What the inbox shows: the text, a caption, or the filled-in template body
    text: { type: String, default: '' },
    template: {
      name: String,
      language: String,
      params: [String],
    },
    media: {
      metaId: String,
      mime: String,
      filename: String,
      size: Number,
      // Private file in `folder`: "cloudinary:..." or a file name in PRIVATE_UPLOAD_DIR (never a public path)
      storedName: String,
      folder: String,
    },
    location: { latitude: Number, longitude: Number, name: String, address: String },
    // Button / list replies: the id or payload that was tapped
    payload: { type: String, default: '' },

    // Meta's message id. Unique so a webhook delivered twice never stores a message twice.
    wamid: { type: String },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'queued' },
    error: { type: String, default: '' },
    replyTo: { type: String, default: '' }, // wamid of the quoted message

    // null = sent automatically (booking notices, reminders, auto-replies)
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    // Short label for automatic messages, e.g. "Booking confirmed"
    label: { type: String, default: '' },
    related: {
      appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
      report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
      enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry' },
    },
    statusAt: {
      sent: Date,
      delivered: Date,
      read: Date,
      failed: Date,
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

messageSchema.index({ wamid: 1 }, { unique: true, partialFilterExpression: { wamid: { $type: 'string' } } });
messageSchema.index({ conversation: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;
