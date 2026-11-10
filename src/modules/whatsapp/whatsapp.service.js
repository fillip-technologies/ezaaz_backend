import path from 'node:path';
import mongoose from 'mongoose';
import env from '../../config/env.js';
import {
  downloadMedia,
  fetchTemplateStatuses,
  prepareTemplate,
  sendDocument,
  sendImage,
  sendInteractive,
  sendTemplate,
  sendText,
  templateKey,
  templateLanguages,
  toWhatsAppNumber,
  uploadMedia,
  whatsappConfigured,
} from '../../config/whatsapp.js';
import ApiError from '../../shared/utils/ApiError.js';
import { privateFilePath, savePrivateFile } from '../../shared/middlewares/upload.js';
import Conversation, { WINDOW_MS, windowOpen } from './conversation.model.js';
import Message, { STATUS_RANK } from './message.model.js';
import { publish } from './inbox.events.js';
import { MANUAL_TEMPLATES } from './templates.js';
import Appointment from '../appointment/appointment.model.js';
import { REMINDER_PAYLOAD, bookingChangeMessage } from '../appointment/appointment.whatsapp.js';
import { formatDate, formatTime } from '../appointment/appointment.emails.js';
import { clinicNow } from '../appointment/slots.js';
import Patient from '../patient/patient.model.js';
import Report, { REPORT_FOLDER } from '../patient/report.model.js';
import { REPORT_PAYLOAD, reportNoticeMessage, reportReadyMessage } from '../patient/patient.whatsapp.js';

// Every WhatsApp message in or out is stored as a Message in its Conversation (one per number), so the
// admin inbox shows the whole history: automatic booking notices, staff replies and the patient's messages.

export const MEDIA_FOLDER = 'whatsapp';
const MAX_INBOUND_MEDIA_BYTES = 25 * 1024 * 1024;
const PREVIEW_LENGTH = 90;
const NO_CONFIG_ERROR = 'WhatsApp is not configured: the message was printed to the server console';
const OPTED_OUT_ERROR = 'The patient replied STOP to WhatsApp messages';

const isObjectId = (v) => mongoose.isValidObjectId(v) && String(new mongoose.Types.ObjectId(String(v))) === String(v);
const phoneKeyOf = (waId) => String(waId).slice(-10);

const TYPE_PREVIEW = {
  document: '📄 Document',
  image: '📷 Photo',
  audio: '🎤 Voice message',
  video: '🎥 Video',
  sticker: 'Sticker',
  location: '📍 Location',
  contacts: '👤 Contact',
  reaction: 'Reaction',
  unsupported: 'Unsupported message',
};

function previewOf(message) {
  const text = (message.text || '').replace(/\s+/g, ' ').trim() || message.media?.filename || TYPE_PREVIEW[message.type] || 'Message';
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text;
}

/* ------------------------------ Conversations ------------------------------ */

// `patient` (id) is added to the chat's patient list
export async function findOrCreateConversation(waId, { name, staff, patient } = {}) {
  const upsert = () =>
    Conversation.findOneAndUpdate(
      { waId },
      { $setOnInsert: { waId, displayName: name || '', staff: Boolean(staff) }, ...(patient && { $addToSet: { patients: patient } }) },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
  // Two messages to a new number at the same moment can race on the unique waId: the retry finds the winner
  const conversation = await upsert().catch((err) => (err.code === 11000 ? upsert() : Promise.reject(err)));
  if (name && !conversation.displayName) {
    conversation.displayName = name;
    await conversation.save();
  }
  return conversation;
}

// After a new message: update the chat's list row and tell open inboxes
async function bumpConversation(conversation, message, { set = {}, inc } = {}) {
  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: previewOf(message),
        lastMessageDirection: message.direction,
        lastMessageStatus: message.status,
        ...set,
      },
      ...(inc && { $inc: inc }),
    },
    { returnDocument: 'after' },
  );
  publish('message', { conversation: String(conversation._id), message });
  publish('conversation', serializeConversation(updated));
  return updated;
}

// A status change of the chat's latest message also changes the ticks in the chat list
async function messageChanged(message) {
  await Conversation.updateOne({ _id: message.conversation, lastMessageAt: message.createdAt }, { lastMessageStatus: message.status });
  publish('message', { conversation: String(message.conversation), message });
}

async function recordOutbound(conversation, fields) {
  const message = await Message.create({ conversation: conversation._id, direction: 'out', status: 'queued', ...fields });
  await bumpConversation(conversation, message);
  return message;
}

// Final state of an outgoing message: sent (with Meta's id), skipped or failed
async function settle(message, { wamid, error, failed }) {
  if (wamid) {
    message.wamid = wamid;
    message.status = 'sent';
    message.statusAt.sent = new Date();
  } else {
    message.status = failed ? 'failed' : 'skipped';
    message.error = error || NO_CONFIG_ERROR;
    if (failed) message.statusAt.failed = new Date();
  }
  await message.save();
  await messageChanged(message);
  return message;
}

/* --------------------------- Sending (templates) --------------------------- */

// Sends an approved template and logs it in the chat. Never throws for a send failure: the returned
// message has status 'failed' and the error. `beforeSend(msg)` can fill in a header (e.g. upload a report first).
export async function sendTemplateLogged(to, msg, { name, related, sentBy = null, staff, patient, media, beforeSend } = {}) {
  const conversation = await findOrCreateConversation(to, { name, staff, patient });
  const prepared = prepareTemplate(msg);
  const message = await recordOutbound(conversation, {
    type: 'template',
    text: prepared.text,
    template: { name: msg.template.name, language: prepared.language, params: prepared.values },
    label: msg.label || '',
    related,
    sentBy,
    ...(media && { media }),
  });
  if (conversation.optedOut && !staff) return settle(message, { error: OPTED_OUT_ERROR });
  try {
    await beforeSend?.(msg);
    return await settle(message, { wamid: await sendTemplate(to, msg) });
  } catch (err) {
    return settle(message, { error: err.message, failed: true });
  }
}

// Fire-and-forget template for automatic notices (bookings, reminders, enquiries). Numbers that can't be
// valid are skipped and failures are only logged, so a booking never fails because of WhatsApp.
// Returns whether a message was attempted.
export function notifyWhatsApp(phone, msg, options = {}) {
  const to = toWhatsAppNumber(phone);
  if (!to) return false;
  sendTemplateLogged(to, msg, options)
    .then((m) => m.status === 'failed' && console.error(`WhatsApp ${msg.template.name} to ${to} failed: ${m.error}`))
    .catch((err) => console.error(`WhatsApp ${msg.template.name} to ${to} failed: ${err.message}`));
  return true;
}

export function notifyStaff(msg, related) {
  for (const number of env.WHATSAPP_NOTIFY_NUMBERS) notifyWhatsApp(number, { ...msg, label: 'Staff alert' }, { staff: true, related });
}

/* ------------------------- Sending (free-form, 24 h) ------------------------- */

const windowClosed = () =>
  new ApiError(409, "It's more than 24 hours since the patient's last message. Send a template instead.", [
    { field: 'type', code: 'WINDOW_CLOSED', message: 'Chat window closed' },
  ]);

// Text, documents, images and buttons: only within 24 hours of the patient's last message
async function sendFreeForm(conversation, fields, send, { automatic = false } = {}) {
  if (!windowOpen(conversation)) throw windowClosed();
  const message = await recordOutbound(conversation, fields);
  if (conversation.optedOut && !automatic) return settle(message, { error: OPTED_OUT_ERROR });
  try {
    return await settle(message, { wamid: await send() });
  } catch (err) {
    return settle(message, { error: err.message, failed: true });
  }
}

const autoText = (conversation, text, label = 'Auto-reply') =>
  sendFreeForm(conversation, { type: 'text', text, label }, () => sendText(conversation.waId, text), { automatic: true });

/* ------------------------------- Admin inbox ------------------------------- */

function serializeConversation(c) {
  if (!c) return c;
  const plain = typeof c.toJSON === 'function' ? c.toJSON() : { ...c };
  const expires = plain.lastInboundAt ? new Date(plain.lastInboundAt).getTime() + WINDOW_MS : 0;
  return { ...plain, windowExpiresAt: expires > Date.now() ? new Date(expires) : null };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listConversations({ filter = 'all', q = '', before, limit = 30 } = {}) {
  const query = { staff: filter === 'staff' ? true : { $ne: true } };
  if (filter === 'unread') query.unreadCount = { $gt: 0 };
  if (filter === 'attention') query.needsAttention = true;
  const search = String(q || '').trim().slice(0, 60);
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const digits = search.replace(/\D/g, '');
    const patients = await Patient.find({ $or: [{ name: regex }, { uhid: regex }] }).select('waId').limit(50).lean();
    query.$or = [
      { displayName: regex },
      { profileName: regex },
      ...(digits.length >= 3 ? [{ waId: { $regex: digits } }] : []),
      ...(patients.length ? [{ waId: { $in: patients.map((p) => p.waId).filter(Boolean) } }] : []),
    ];
  }
  if (before) {
    const date = new Date(before);
    if (!Number.isNaN(date.getTime())) query.lastMessageAt = { $lt: date };
  }
  const size = Math.min(Number(limit) || 30, 100);
  const rows = await Conversation.find(query).sort({ lastMessageAt: -1, _id: -1 }).limit(size + 1).lean();
  return { conversations: rows.slice(0, size).map(serializeConversation), hasMore: rows.length > size };
}

async function getConversationDoc(id) {
  const conversation = isObjectId(id) && (await Conversation.findById(id));
  if (!conversation) throw ApiError.notFound('Chat not found');
  return conversation;
}

// The chat plus everything the side panel shows: patients on this number, their bookings and reports
export async function getConversation(id) {
  const conversation = await getConversationDoc(id);
  const patients = await Patient.find({ $or: [{ _id: { $in: conversation.patients } }, { waId: conversation.waId }] })
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();
  const today = clinicNow().date;
  const [appointments, reports] = await Promise.all([
    Appointment.find({ phoneKey: phoneKeyOf(conversation.waId) })
      .select('ref doctorName date time status patientName patient patientConfirmedAt changeRequestedAt')
      .sort({ date: -1, time: -1 })
      .limit(20)
      .lean(),
    Report.find({ patient: { $in: patients.map((p) => p._id) } })
      .select('-file.storedName')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
  ]);
  return {
    conversation: serializeConversation(conversation),
    patients,
    upcoming: appointments.filter((a) => a.date >= today && a.status === 'confirmed').reverse(),
    pastAppointments: appointments.filter((a) => a.date < today || a.status !== 'confirmed'),
    reports,
  };
}

export async function listMessages(id, { before, limit = 50 } = {}) {
  const conversation = await getConversationDoc(id);
  const size = Math.min(Number(limit) || 50, 100);
  const rows = await Message.find({ conversation: conversation._id, ...(isObjectId(before) && { _id: { $lt: before } }) })
    .sort({ _id: -1 })
    .limit(size + 1)
    .lean();
  return { messages: rows.slice(0, size).reverse(), hasMore: rows.length > size };
}

export async function updateConversation(id, body) {
  const conversation = await getConversationDoc(id);
  if (body.read) conversation.unreadCount = 0;
  if (body.status !== undefined) {
    if (!['open', 'closed'].includes(body.status)) throw ApiError.badRequest('Choose a valid status');
    conversation.status = body.status;
  }
  if (body.needsAttention === false) {
    conversation.needsAttention = false;
    conversation.attentionReason = '';
  }
  if (body.displayName !== undefined) conversation.displayName = String(body.displayName).trim().slice(0, 100);
  if (body.linkPatient) {
    if (!isObjectId(body.linkPatient) || !(await Patient.exists({ _id: body.linkPatient }))) throw ApiError.badRequest('Choose a valid patient');
    conversation.patients.addToSet(body.linkPatient);
  }
  await conversation.save();
  const serialized = serializeConversation(conversation);
  publish('conversation', serialized);
  return serialized;
}

// Opens (or finds) the chat for a number; the first message must then be a template
export async function startConversation({ phone, name }) {
  const waId = toWhatsAppNumber(phone);
  if (!waId) throw new ApiError(400, 'Validation failed', [{ field: 'phone', message: 'Enter a valid mobile number' }]);
  const conversation = await findOrCreateConversation(waId, { name: name ? String(name).trim().slice(0, 100) : '' });
  if (!conversation.lastMessageAt) {
    conversation.lastMessageAt = new Date();
    await conversation.save();
  }
  return serializeConversation(conversation);
}

export async function inboxSummary() {
  const [unread, attention] = await Promise.all([
    Conversation.countDocuments({ staff: { $ne: true }, unreadCount: { $gt: 0 } }),
    Conversation.countDocuments({ staff: { $ne: true }, needsAttention: true }),
  ]);
  return { unread, attention, configured: whatsappConfigured };
}

const patientLanguage = async (waId) => (await Patient.findOne({ waId }).sort({ updatedAt: -1 }).select('language').lean())?.language || 'en';

export async function sendTextFromInbox(id, text, admin) {
  const body = String(text || '').trim();
  if (!body) throw ApiError.badRequest('Type a message');
  if (body.length > 4096) throw ApiError.badRequest('Messages can be up to 4096 characters');
  const conversation = await getConversationDoc(id);
  return sendFreeForm(conversation, { type: 'text', text: body, sentBy: admin._id }, () => sendText(conversation.waId, body));
}

// A file chosen in the inbox (saved by privateDocumentUpload into PRIVATE_UPLOAD_DIR/whatsapp)
export async function sendFileFromInbox(id, file, caption, admin) {
  if (!file) throw ApiError.badRequest('Choose a file');
  const conversation = await getConversationDoc(id);
  const isImage = file.mimetype.startsWith('image/');
  const filename = path.basename(file.originalname || file.filename).slice(0, 120);
  const media = { mime: file.mimetype, filename, size: file.size, storedName: file.filename, folder: MEDIA_FOLDER };
  const text = String(caption || '').trim().slice(0, 1000);
  return sendFreeForm(conversation, { type: isImage ? 'image' : 'document', text, media, sentBy: admin._id }, async () => {
    const mediaId = await uploadMedia(file.path, file.mimetype, filename);
    return isImage ? sendImage(conversation.waId, { mediaId, caption: text }) : sendDocument(conversation.waId, { mediaId, filename, caption: text });
  });
}

let statusCache = { at: 0, statuses: null };
async function cachedTemplateStatuses() {
  if (!whatsappConfigured || !env.WHATSAPP_BUSINESS_ACCOUNT_ID) return null;
  if (Date.now() - statusCache.at < 5 * 60 * 1000) return statusCache.statuses;
  const statuses = await fetchTemplateStatuses().catch(() => null);
  statusCache = { at: Date.now(), statuses };
  return statuses;
}

// Templates staff can pick in the inbox, with their approval status in the default language
export async function listManualTemplates() {
  const statuses = await cachedTemplateStatuses();
  return Object.entries(MANUAL_TEMPLATES).map(([key, t]) => ({
    key,
    name: t.name,
    label: t.manual.label,
    fields: t.manual.fields,
    body: t.body,
    status: statuses ? statuses.get(templateKey(t.name, templateLanguages(t)[0])) || 'MISSING' : whatsappConfigured ? 'UNKNOWN' : 'NOT_CONFIGURED',
  }));
}

export async function sendTemplateFromInbox(id, key, values = {}, admin) {
  const template = MANUAL_TEMPLATES[key];
  if (!template) throw ApiError.badRequest('Choose a template');
  const params = template.manual.fields.map((f) => String(values[f.key] ?? '').trim());
  const missing = template.manual.fields.filter((f, i) => !params[i]);
  if (missing.length) throw new ApiError(400, 'Validation failed', missing.map((f) => ({ field: f.key, message: `Enter ${f.label.toLowerCase()}` })));
  const conversation = await getConversationDoc(id);
  return sendTemplateLogged(
    conversation.waId,
    { template, params, language: await patientLanguage(conversation.waId), label: template.manual.label },
    { sentBy: admin._id, name: params[0] },
  );
}

// Stored file of a message (patient's media, or a document staff sent)
export async function messageFile(messageId) {
  const message = isObjectId(messageId) && (await Message.findById(messageId).lean());
  if (!message?.media?.storedName) throw ApiError.notFound('File not found');
  return { path: privateFilePath(message.media.folder || MEDIA_FOLDER, message.media.storedName), mime: message.media.mime, filename: message.media.filename };
}

/* --------------------------------- Reports --------------------------------- */

const REPORT_EXTENSIONS = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
const reportFilename = (report) =>
  `${(report.title || 'report').replace(/[^\p{L}\p{N} ._-]+/gu, '').trim().slice(0, 80) || 'report'}${REPORT_EXTENSIONS[report.file.mime] || ''}`;

// Sends a report on WhatsApp in the safest way the chat allows:
// chat open (they wrote in the last 24 h) -> the file itself;
// number checked by staff at the desk -> template with the PDF attached;
// otherwise -> a notice with a "Send my report" button (the file follows when the holder of the phone taps it).
// None of these can prove who holds the phone, so staff confirm the name and number before sending.
export async function sendReport(reportId, admin) {
  const report = isObjectId(reportId) && (await Report.findById(reportId));
  if (!report) throw ApiError.notFound('Report not found');
  const patient = await Patient.findById(report.patient);
  if (!patient) throw ApiError.notFound('Patient not found');
  if (!patient.consent?.reports?.at) {
    throw ApiError.conflict(`${patient.name} hasn't agreed to get reports on WhatsApp. Record their consent on the patient page first.`);
  }
  const waId = patient.waId || toWhatsAppNumber(patient.phone);
  if (!waId) throw ApiError.badRequest("The patient's mobile number isn't a valid WhatsApp number");

  const conversation = await findOrCreateConversation(waId, { name: patient.name });
  if (!conversation.patients.some((p) => String(p) === String(patient._id))) {
    conversation.patients.push(patient._id);
    await conversation.save();
  }
  if (conversation.optedOut) throw ApiError.conflict(`${patient.name} replied STOP, so WhatsApp messages can't be sent.`);

  const filePath = privateFilePath(REPORT_FOLDER, report.file.storedName);
  const filename = reportFilename(report);
  const media = { mime: report.file.mime, filename, size: report.file.size, storedName: report.file.storedName, folder: REPORT_FOLDER };
  const isPdf = report.file.mime === 'application/pdf';
  const isImage = report.file.mime.startsWith('image/');
  const related = { report: report._id };
  const sentBy = admin?._id ?? null;

  let method;
  let message;
  if (windowOpen(conversation)) {
    method = 'document';
    const caption = patient.language === 'hi' ? `${report.title} · एजाज़ हॉस्पिटल` : `${report.title} · Ejaz Hospital`;
    message = await sendFreeForm(
      conversation,
      { type: isImage ? 'image' : 'document', text: caption, media, label: 'Report sent', related, sentBy },
      async () => {
        const mediaId = await uploadMedia(filePath, report.file.mime, filename);
        return isImage ? sendImage(waId, { mediaId, caption }) : sendDocument(waId, { mediaId, filename, caption });
      },
      { automatic: !admin },
    );
  } else if (patient.phoneVerifiedBy === 'desk' && isPdf) {
    method = 'template';
    message = await sendTemplateLogged(waId, reportReadyMessage(patient, report, null), {
      name: patient.name,
      related,
      sentBy,
      media,
      beforeSend: async (msg) => {
        msg.header = { document: { id: await uploadMedia(filePath, report.file.mime, filename), filename } };
      },
    });
  } else {
    method = 'notice';
    message = await sendTemplateLogged(waId, reportNoticeMessage(patient, report), { name: patient.name, related, sentBy });
  }

  report.sends.push({ by: sentBy, method, message: message._id });
  await report.save();
  return { method, message };
}

/* --------------------------------- Webhook --------------------------------- */

function parseInbound(m) {
  const type = m.type;
  if (type === 'text') return { type, text: m.text?.body || '' };
  if (['image', 'document', 'audio', 'video', 'sticker'].includes(type)) {
    const media = m[type] || {};
    return { type, text: media.caption || '', media: { metaId: media.id, mime: media.mime_type, filename: media.filename || '' } };
  }
  if (type === 'location') {
    const l = m.location || {};
    return { type, text: [l.name, l.address].filter(Boolean).join(', '), location: l };
  }
  if (type === 'contacts') return { type, text: (m.contacts || []).map((c) => c.name?.formatted_name).filter(Boolean).join(', ') };
  if (type === 'button') return { type, text: m.button?.text || '', payload: m.button?.payload || '' };
  if (type === 'interactive') {
    const reply = m.interactive?.button_reply || m.interactive?.list_reply || {};
    return { type, text: reply.title || '', payload: reply.id || '' };
  }
  if (type === 'reaction') return { type, text: m.reaction?.emoji || '' };
  return { type: 'unsupported', text: '' };
}

async function storeInboundMedia(message) {
  if (!whatsappConfigured) return;
  const { buffer, mime } = await downloadMedia(message.media.metaId);
  if (buffer.length > MAX_INBOUND_MEDIA_BYTES) return;
  message.media.storedName = await savePrivateFile(MEDIA_FOLDER, buffer, mime);
  message.media.folder = MEDIA_FOLDER;
  message.media.size = buffer.length;
  if (mime) message.media.mime = mime;
  await message.save();
  publish('message', { conversation: String(message.conversation), message });
}

async function receive(m, profileName) {
  const fields = parseInbound(m);
  const conversation = await findOrCreateConversation(m.from);
  const previousInbound = conversation.lastInboundAt;

  let message;
  try {
    message = await Message.create({
      conversation: conversation._id,
      direction: 'in',
      status: 'received',
      wamid: m.id,
      replyTo: m.context?.id || '',
      ...fields,
    });
  } catch (err) {
    if (err.code === 11000) return; // Meta delivered this webhook before
    throw err;
  }

  const set = { lastInboundAt: new Date(), status: 'open' };
  if (profileName) set.profileName = profileName;
  if (profileName && !conversation.displayName) set.displayName = profileName;
  const updated = await bumpConversation(conversation, message, { set, inc: fields.type === 'reaction' ? undefined : { unreadCount: 1 } });

  // A message from the number proves it belongs to someone reachable there: reports may now carry the file
  await Patient.updateMany({ waId: m.from, phoneVerifiedAt: null }, { phoneVerifiedAt: new Date(), phoneVerifiedBy: 'whatsapp' });
  if (fields.media?.metaId) storeInboundMedia(message).catch((err) => console.error(`WhatsApp media download failed: ${err.message}`));

  await automate(updated, message, previousInbound);
}

const DELIVERY_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

// Receipts can arrive together or out of order, so the update itself only matches a message whose status
// is still lower: "delivered" after "read" changes nothing.
async function applyStatus(s) {
  if (!DELIVERY_STATUSES.has(s.status)) return;
  const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
  let filter;
  const set = { status: s.status, [`statusAt.${s.status}`]: at };
  if (s.status === 'failed') {
    const e = s.errors?.[0] || {};
    filter = { wamid: s.id };
    set.error = [e.title || e.message || 'Not delivered', e.code && `(code ${e.code})`, e.error_data?.details].filter(Boolean).join(' ');
  } else {
    const notLower = Object.keys(STATUS_RANK).filter((k) => STATUS_RANK[k] >= STATUS_RANK[s.status]);
    filter = { wamid: s.id, status: { $nin: [...notLower, 'failed'] } };
  }
  const message = await Message.findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' });
  if (message) await messageChanged(message);
}

// Meta's webhook payload: incoming messages and delivery receipts for our number
export async function handleWebhook(body) {
  if (body?.object !== 'whatsapp_business_account') return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const phoneId = value.metadata?.phone_number_id;
      if (env.WHATSAPP_PHONE_NUMBER_ID && phoneId && phoneId !== env.WHATSAPP_PHONE_NUMBER_ID) continue;
      const names = new Map((value.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
      for (const m of value.messages || []) {
        await receive(m, names.get(m.from)).catch((err) => console.error(`WhatsApp incoming message failed: ${err.message}`));
      }
      for (const s of value.statuses || []) {
        await applyStatus(s).catch((err) => console.error(`WhatsApp status update failed: ${err.message}`));
      }
    }
  }
}

/* ------------------------------ Automatic replies ------------------------------ */

const STOP_WORDS = new Set(['STOP', 'UNSUBSCRIBE', 'STOP ALL']);
const START_WORDS = new Set(['START', 'SUBSCRIBE', 'UNSTOP']);
const QUIET_AFTER_OUTBOUND_MS = 12 * 60 * 60 * 1000;
const MENU = { book: 'MENU_BOOK', appointment: 'MENU_APPOINTMENT', reports: 'MENU_REPORTS', reception: 'MENU_RECEPTION', emergency: 'MENU_EMERGENCY' };

const AUTO_TEXT = {
  en: {
    menuBody: (name) =>
      `Hello${name ? ` ${name}` : ''}, welcome to Ejaz Hospital. How can we help? Choose an option below, or type your message and our team will reply here.`,
    menuButton: 'Choose an option',
    rows: {
      book: ['Book appointment', 'Book a doctor online'],
      appointment: ['My appointment', 'See your upcoming booking'],
      reports: ['My reports', 'Ask for your test reports'],
      reception: ['Talk to reception', 'Chat with our team'],
      emergency: ['Emergency', '24×7 emergency number'],
    },
    book: `Book online: ${env.CLIENT_URL}/book-appointment\nOr call us on ${env.HOSPITAL_PHONE}.`,
    noAppointment: `We couldn't find an upcoming booking for this number. Book online at ${env.CLIENT_URL}/book-appointment or call ${env.HOSPITAL_PHONE}.`,
    appointments: (list) => `Your upcoming appointments:\n\n${list}\n\nTo change one, reply here or call ${env.HOSPITAL_PHONE}.`,
    reports: 'Thank you. Our team will check and send your reports here shortly.',
    reception: `Thank you. Our team will reply here as soon as possible. For anything urgent, call ${env.HOSPITAL_PHONE}.`,
    emergency: `For a medical emergency, call ${env.EMERGENCY_PHONE} now. Our emergency department is open 24×7.`,
    confirmed: 'Thank you for confirming. See you tomorrow!',
    change: `Thank you. Our team will contact you to find a new time. You can also call ${env.HOSPITAL_PHONE}.`,
    stopped: 'You will no longer get WhatsApp messages from Ejaz Hospital. Reply START at any time to turn them back on.',
    started: 'WhatsApp messages from Ejaz Hospital are turned back on.',
    reportFailed: `Sorry, we couldn't send that report here. Please call ${env.HOSPITAL_PHONE}.`,
  },
  hi: {
    menuBody: (name) =>
      `नमस्ते${name ? ` ${name}` : ''}, एजाज़ हॉस्पिटल में आपका स्वागत है। हम आपकी क्या मदद करें? नीचे से विकल्प चुनें, या अपना मैसेज लिखें, हमारी टीम यहीं जवाब देगी।`,
    menuButton: 'विकल्प चुनें',
    rows: {
      book: ['अपॉइंटमेंट बुक करें', 'ऑनलाइन डॉक्टर बुक करें'],
      appointment: ['मेरा अपॉइंटमेंट', 'आने वाली बुकिंग देखें'],
      reports: ['मेरी रिपोर्ट', 'अपनी जाँच रिपोर्ट मँगाएँ'],
      reception: ['रिसेप्शन से बात', 'हमारी टीम से चैट करें'],
      emergency: ['इमरजेंसी', '24×7 इमरजेंसी नंबर'],
    },
    book: `ऑनलाइन बुक करें: ${env.CLIENT_URL}/book-appointment\nया हमें ${env.HOSPITAL_PHONE} पर कॉल करें।`,
    noAppointment: `इस नंबर पर कोई आने वाली बुकिंग नहीं मिली। ${env.CLIENT_URL}/book-appointment पर बुक करें या ${env.HOSPITAL_PHONE} पर कॉल करें।`,
    appointments: (list) => `आपके आने वाले अपॉइंटमेंट:\n\n${list}\n\nबदलना हो तो यहाँ जवाब दें या ${env.HOSPITAL_PHONE} पर कॉल करें।`,
    reports: 'धन्यवाद। हमारी टीम आपकी रिपोर्ट जाँचकर जल्द ही यहाँ भेजेगी।',
    reception: `धन्यवाद। हमारी टीम जल्द से जल्द यहाँ जवाब देगी। ज़रूरी हो तो ${env.HOSPITAL_PHONE} पर कॉल करें।`,
    emergency: `मेडिकल इमरजेंसी में अभी ${env.EMERGENCY_PHONE} पर कॉल करें। हमारा इमरजेंसी विभाग 24×7 खुला है।`,
    confirmed: 'कन्फर्म करने के लिए धन्यवाद। कल मिलते हैं!',
    change: `धन्यवाद। नया समय तय करने के लिए हमारी टीम आपसे संपर्क करेगी। आप ${env.HOSPITAL_PHONE} पर कॉल भी कर सकते हैं।`,
    stopped: 'अब आपको एजाज़ हॉस्पिटल से WhatsApp मैसेज नहीं मिलेंगे। दोबारा शुरू करने के लिए कभी भी START लिखें।',
    started: 'एजाज़ हॉस्पिटल के WhatsApp मैसेज फिर से शुरू हो गए हैं।',
    reportFailed: `माफ़ कीजिए, हम वह रिपोर्ट यहाँ नहीं भेज पाए। कृपया ${env.HOSPITAL_PHONE} पर कॉल करें।`,
  },
};

async function flag(conversation, reason) {
  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    { needsAttention: true, attentionReason: reason, status: 'open' },
    { returnDocument: 'after' },
  );
  publish('conversation', serializeConversation(updated));
}

async function sendMenu(conversation, t) {
  const firstName = (conversation.displayName || conversation.profileName || '').split(' ')[0];
  const rows = Object.entries(MENU).map(([key, id]) => ({ id, title: t.rows[key][0], description: t.rows[key][1] }));
  const text = t.menuBody(firstName);
  await sendFreeForm(
    conversation,
    { type: 'interactive', text, label: 'Auto-reply menu' },
    () =>
      sendInteractive(
        conversation.waId,
        { type: 'list', body: { text }, action: { button: t.menuButton, sections: [{ title: 'Ejaz Hospital', rows }] } },
        `${text}\n\n${rows.map((r) => `• ${r.title}`).join('\n')}`,
      ),
    { automatic: true },
  );
}

async function upcomingFor(waId, t) {
  const appointments = await Appointment.find({ phoneKey: phoneKeyOf(waId), active: true, status: 'confirmed', date: { $gte: clinicNow().date } })
    .sort({ date: 1, time: 1 })
    .limit(5)
    .lean();
  if (!appointments.length) return t.noAppointment;
  const lang = t === AUTO_TEXT.hi ? 'hi' : 'en';
  return t.appointments(
    appointments.map((a) => `• ${a.patientName}: ${a.doctorName}, ${formatDate(a.date, lang)} ${formatTime(a.time)} (${a.ref})`).join('\n'),
  );
}

async function handlePayload(conversation, message, t) {
  const [action, id] = message.payload.split(':');
  const phoneKey = phoneKeyOf(conversation.waId);

  if (action === REMINDER_PAYLOAD.confirm || action === REMINDER_PAYLOAD.change) {
    if (!isObjectId(id)) return;
    const confirm = action === REMINDER_PAYLOAD.confirm;
    const appointment = await Appointment.findOneAndUpdate(
      { _id: id, phoneKey },
      { $set: confirm ? { patientConfirmedAt: new Date() } : { changeRequestedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!appointment) return;
    if (!confirm) {
      await flag(conversation, `Wants to change booking ${appointment.ref}`);
      notifyStaff(bookingChangeMessage(appointment, 'patient asked to change the time'), { appointment: appointment._id });
    }
    await autoText(conversation, confirm ? t.confirmed : t.change);
    return;
  }

  if (action === REPORT_PAYLOAD) {
    const report = isObjectId(id) && (await Report.findById(id).lean());
    const patient = report && (await Patient.findById(report.patient).lean());
    const owner = patient && (patient.waId || toWhatsAppNumber(patient.phone)) === conversation.waId;
    if (!owner) return;
    const { message: sent } = await sendReport(report._id, null).catch(() => ({ message: { status: 'failed' } }));
    if (sent.status === 'failed') await autoText(conversation, t.reportFailed);
    return;
  }

  switch (action) {
    case MENU.book:
      return autoText(conversation, t.book);
    case MENU.appointment:
      return autoText(conversation, await upcomingFor(conversation.waId, t));
    case MENU.reports:
      await flag(conversation, 'Asked for reports');
      return autoText(conversation, t.reports);
    case MENU.reception:
      await flag(conversation, 'Wants to talk to reception');
      return autoText(conversation, t.reception);
    case MENU.emergency:
      return autoText(conversation, t.emergency);
    default:
  }
}

// STOP / START, button taps, and a menu when a patient writes to us out of the blue
async function automate(conversation, message, previousInbound) {
  const t = AUTO_TEXT[await patientLanguage(conversation.waId)] || AUTO_TEXT.en;
  const word = message.type === 'text' ? message.text.trim().toUpperCase() : '';

  if (STOP_WORDS.has(word) || START_WORDS.has(word)) {
    const stop = STOP_WORDS.has(word);
    conversation.optedOut = stop;
    conversation.optedOutAt = stop ? new Date() : null;
    await conversation.save();
    publish('conversation', serializeConversation(conversation));
    await autoText(conversation, stop ? t.stopped : t.started);
    return;
  }
  if (message.payload) {
    await handlePayload(conversation, message, t);
    return;
  }
  if (!env.WHATSAPP_AUTO_REPLY || conversation.optedOut || conversation.staff) return;
  // Only for a fresh conversation: no message from them in the last 24 h and none from us in the last 12 h
  if (previousInbound && Date.now() - new Date(previousInbound).getTime() < WINDOW_MS) return;
  if (await Message.exists({ conversation: conversation._id, direction: 'out', createdAt: { $gte: new Date(Date.now() - QUIET_AFTER_OUTBOUND_MS) } })) {
    return;
  }
  await sendMenu(conversation, t);
}
