import fs from 'node:fs';
import env from '../../config/env.js';
import { validSignature } from '../../config/whatsapp.js';
import ApiError from '../../shared/utils/ApiError.js';
import * as whatsappService from './whatsapp.service.js';
import { openStream } from './inbox.events.js';

/* Webhook (called by Meta) */

// Meta's one-time check when the callback URL is saved in the app dashboard
export function verifyWebhook(req, res) {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.type('text/plain').send(String(challenge ?? ''));
    return;
  }
  res.sendStatus(403);
}

// Incoming messages and delivery receipts. Answered at once (Meta retries slow or failed calls), then processed.
export function receiveWebhook(req, res) {
  if (!validSignature(req.rawBody, req.get('x-hub-signature-256'))) {
    if (!env.WHATSAPP_APP_SECRET) console.warn('WhatsApp webhook call rejected: set WHATSAPP_APP_SECRET to accept them.');
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  whatsappService.handleWebhook(req.body).catch((err) => console.error(`WhatsApp webhook failed: ${err.message}`));
}

/* Admin inbox */

export async function summary(req, res) {
  res.json({ success: true, data: await whatsappService.inboxSummary() });
}

export function stream(req, res) {
  openStream(req, res);
}

export async function listConversations(req, res) {
  res.json({ success: true, data: await whatsappService.listConversations(req.query) });
}

export async function startConversation(req, res) {
  res.status(201).json({ success: true, data: await whatsappService.startConversation(req.body ?? {}) });
}

export async function getConversation(req, res) {
  res.json({ success: true, data: await whatsappService.getConversation(req.params.id) });
}

export async function updateConversation(req, res) {
  res.json({ success: true, data: await whatsappService.updateConversation(req.params.id, req.body ?? {}) });
}

export async function listMessages(req, res) {
  res.json({ success: true, data: await whatsappService.listMessages(req.params.id, req.query) });
}

// { type: 'text', text } | { type: 'template', key, values } | { type: 'report', reportId }
export async function sendMessage(req, res) {
  const body = req.body ?? {};
  let message;
  if (body.type === 'text') message = await whatsappService.sendTextFromInbox(req.params.id, body.text, req.admin);
  else if (body.type === 'template') message = await whatsappService.sendTemplateFromInbox(req.params.id, body.key, body.values, req.admin);
  else if (body.type === 'report') message = (await whatsappService.sendReport(body.reportId, req.admin)).message;
  else throw ApiError.badRequest('Choose what to send');
  res.status(201).json({ success: true, data: message });
}

export async function sendFile(req, res) {
  const message = await whatsappService.sendFileFromInbox(req.params.id, req.file, req.body?.caption, req.admin);
  res.status(201).json({ success: true, data: message });
}

export async function listTemplates(req, res) {
  res.json({ success: true, data: await whatsappService.listManualTemplates() });
}

export async function messageFile(req, res) {
  const file = await whatsappService.messageFile(req.params.messageId);
  if (!fs.existsSync(file.path)) throw ApiError.notFound('File not found');
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(file.mime || 'application/octet-stream');
  res.attachment(file.filename || 'file');
  if (req.query.inline && /^(image|audio|video)\/|^application\/pdf$/.test(file.mime || '')) res.set('Content-Disposition', 'inline');
  fs.createReadStream(file.path).pipe(res);
}
