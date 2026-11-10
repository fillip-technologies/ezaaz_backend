import mongoose from 'mongoose';

// One chat per WhatsApp number. Several patients can share a number (a parent booking for a child),
// so the chat links to every patient on it rather than being the patient.
const conversationSchema = new mongoose.Schema(
  {
    // Digits with country code, the same as toWhatsAppNumber() and Meta's wa_id
    waId: { type: String, required: true, unique: true },
    // Name on the patient's WhatsApp profile (from incoming messages)
    profileName: { type: String, trim: true, default: '' },
    // Best known name: profile name, or the latest booking / enquiry name
    displayName: { type: String, trim: true, default: '' },
    patients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Patient' }],
    // A WHATSAPP_NOTIFY_NUMBERS staff number (booking alerts): kept out of the patient chat list
    staff: { type: Boolean, default: false },

    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: '' },
    lastMessageDirection: { type: String, enum: ['in', 'out', ''], default: '' },
    lastMessageStatus: { type: String, default: '' },
    // Free-form messages are allowed until 24 hours after this
    lastInboundAt: { type: Date, default: null },
    unreadCount: { type: Number, default: 0 },
    // Set by "Need to change" buttons, "Talk to reception", report requests; cleared by staff
    needsAttention: { type: Boolean, default: false },
    attentionReason: { type: String, default: '' },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },

    // The patient replied STOP: no more messages until START
    optedOut: { type: Boolean, default: false },
    optedOutAt: { type: Date, default: null },
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

conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ unreadCount: 1, lastMessageAt: -1 });

export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const windowOpen = (conversation, now = Date.now()) =>
  Boolean(conversation.lastInboundAt && now - new Date(conversation.lastInboundAt).getTime() < WINDOW_MS);

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
