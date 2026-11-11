import crypto from 'node:crypto';
import env from './env.js';

// WhatsApp Cloud API client. Messages the hospital starts must use a template that Meta has approved;
// templates are defined next to the feature that sends them (collected in modules/whatsapp/templates.js)
// and created with `npm run whatsapp:templates`. Free-form messages (text, documents) are only allowed
// within 24 hours of the patient's last message.

export const whatsappConfigured = Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

const GRAPH_URL = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}`;
const TIMEOUT_MS = 10000;
const UPLOAD_TIMEOUT_MS = 60000;

// Languages a template can be submitted in. A template with `bodyHi` is also created in Hindi.
export const HINDI = 'hi';
export const templateLanguages = (template) => [env.WHATSAPP_TEMPLATE_LANG, ...(template.bodyHi && env.WHATSAPP_TEMPLATE_LANG !== HINDI ? [HINDI] : [])];
const languageFor = (template, language) => (language === HINDI && template.bodyHi ? HINDI : env.WHATSAPP_TEMPLATE_LANG);

// Calls the Graph API (a path, or a full paging URL) and throws a readable error (Meta's message, code and details) on failure.
// `form` (FormData) is sent as multipart instead of a JSON `body`.
export async function graphRequest(path, { method = 'GET', body, form, timeout = TIMEOUT_MS } = {}) {
  const res = await fetch(path.startsWith('https://') ? path : `${GRAPH_URL}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: form || (body && JSON.stringify(body)),
    signal: AbortSignal.timeout(timeout),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    const details = e.error_data?.details || e.error_user_msg;
    const err = new Error(`${e.message || `HTTP ${res.status}`}${e.code ? ` (code ${e.code})` : ''}${details ? `: ${details}` : ''}`);
    err.status = res.status;
    err.code = e.code;
    throw err;
  }
  return data;
}

// Turns a patient-entered number into WhatsApp's format (country code + number, digits only).
// Returns null when it can't be a valid number.
export function toWhatsAppNumber(phone) {
  const raw = String(phone || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2); // international prefix
    else if (digits.length === 11 && digits.startsWith('0')) digits = env.WHATSAPP_DEFAULT_COUNTRY_CODE + digits.slice(1);
    else if (digits.length === 10) digits = env.WHATSAPP_DEFAULT_COUNTRY_CODE + digits;
  }
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

// Template variables can't be empty or contain newlines, tabs or runs of spaces
function cleanParam(value, maxLength = 200) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '—';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export const templateBody = (template, language) => (languageFor(template, language) === HINDI ? template.bodyHi : template.body);
export const renderTemplate = (template, params, language) =>
  templateBody(template, language).replace(/\{\{(\d+)\}\}/g, (_, i) => params[i - 1]);

// Meta rejects a message whose filled-in body is over 1024 characters: shorten the longest values until it fits
const MAX_BODY_LENGTH = 1024;
function fitBody(template, values, language) {
  const fitted = [...values];
  let excess = renderTemplate(template, fitted, language).length - MAX_BODY_LENGTH;
  while (excess > 0) {
    const i = fitted.reduce((longest, v, j) => (v.length > fitted[longest].length ? j : longest), 0);
    const keep = Math.max(1, fitted[i].length - excess - 1);
    fitted[i] = `${fitted[i].slice(0, keep)}…`;
    excess = renderTemplate(template, fitted, language).length - MAX_BODY_LENGTH;
  }
  return fitted;
}

// The values and text a template message will be sent with (also what the inbox shows)
export function prepareTemplate({ template, params, language }) {
  const values = fitBody(template, params.map((p) => cleanParam(p, template.maxParamLength)), language);
  return { values, language: languageFor(template, language), text: renderTemplate(template, values, language) };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Posts one message. Returns Meta's message id. Retries once on rate limits and Meta server errors.
async function postMessage(to, payload) {
  const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload };
  for (let attempt = 1; ; attempt++) {
    try {
      const data = await graphRequest(`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: 'POST', body });
      return data.messages?.[0]?.id ?? null;
    } catch (err) {
      const retryable = !err.status || err.status === 429 || err.status >= 500;
      if (attempt >= 2 || !retryable) throw err;
      await wait(2000);
    }
  }
}

function printUnsent(to, label, text) {
  console.log(`\n--- WhatsApp (not sent, WhatsApp not configured) ---\nTo: ${to}\n${label}\n\n${text}\n---\n`);
  return null;
}

// Sends an approved template. `params` fill {{1}}, {{2}}, ... of the body in order.
// `header` ({ document: { id, filename } }) fills a DOCUMENT header; `buttonPayloads` are returned by quick-reply buttons.
// A Hindi message whose Hindi template isn't available yet is sent in the default language instead.
export async function sendTemplate(to, { template, params, language, header, buttonPayloads = [] }) {
  const prepared = prepareTemplate({ template, params, language });
  if (!whatsappConfigured) return printUnsent(to, `Template: ${template.name} (${prepared.language})`, prepared.text);

  const build = (lang, values) => {
    const components = [];
    if (header?.document) components.push({ type: 'header', parameters: [{ type: 'document', document: header.document }] });
    components.push({ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) });
    buttonPayloads.forEach((payload, index) => {
      if (payload) components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }] });
    });
    return { type: 'template', template: { name: template.name, language: { code: lang }, components } };
  };

  try {
    return await postMessage(to, build(prepared.language, prepared.values));
  } catch (err) {
    if (prepared.language !== HINDI || err.code !== 132001) throw err;
    const fallback = prepareTemplate({ template, params });
    return postMessage(to, build(fallback.language, fallback.values));
  }
}

// Free-form messages: only allowed within 24 hours of the patient's last message
export async function sendText(to, text) {
  if (!whatsappConfigured) return printUnsent(to, 'Text', text);
  return postMessage(to, { type: 'text', text: { body: text, preview_url: true } });
}

export async function sendDocument(to, { mediaId, filename, caption }) {
  if (!whatsappConfigured) return printUnsent(to, `Document: ${filename}`, caption || '');
  return postMessage(to, { type: 'document', document: { id: mediaId, filename, ...(caption && { caption }) } });
}

export async function sendImage(to, { mediaId, caption }) {
  if (!whatsappConfigured) return printUnsent(to, 'Image', caption || '');
  return postMessage(to, { type: 'image', image: { id: mediaId, ...(caption && { caption }) } });
}

// Reply buttons (up to 3) or a list (button + rows)
export async function sendInteractive(to, interactive, previewText) {
  if (!whatsappConfigured) return printUnsent(to, 'Interactive', previewText);
  return postMessage(to, { type: 'interactive', interactive });
}

// Uploads a file's contents to Meta and returns its media id (valid for 30 days). Media is uploaded at send time,
// so reports never need a public URL.
export async function uploadMedia(buffer, mime, filename) {
  if (!whatsappConfigured) return null;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([buffer], { type: mime }), filename);
  const data = await graphRequest(`${env.WHATSAPP_PHONE_NUMBER_ID}/media`, { method: 'POST', form, timeout: UPLOAD_TIMEOUT_MS });
  return data.id;
}

// Downloads media a patient sent. Returns { buffer, mime }.
export async function downloadMedia(mediaId) {
  const info = await graphRequest(mediaId);
  const res = await fetch(info.url, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Media download failed (HTTP ${res.status})`);
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: info.mime_type };
}

// Webhook POSTs are signed with the app secret: X-Hub-Signature-256 = sha256=<HMAC of the raw body>
export function validSignature(rawBody, header) {
  if (!env.WHATSAPP_APP_SECRET || !rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex'));
  const given = Buffer.from(header.slice(7));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Startup check: token + phone number work, and every template the app uses is approved.
// Only logs; WhatsApp is optional and never stops the server.
export async function verifyWhatsApp(templates = []) {
  if (!whatsappConfigured) {
    console.warn('WhatsApp not configured: WhatsApp messages will be printed to the console instead of sent.');
    return;
  }
  try {
    const phone = await graphRequest(`${env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`);
    console.log(`WhatsApp ready: ${phone.verified_name} (${phone.display_phone_number}), quality ${phone.quality_rating || 'unknown'}`);
  } catch (err) {
    console.error(`WhatsApp verification failed: ${err.message}`);
    return;
  }
  if (!env.WHATSAPP_APP_SECRET) console.warn('WHATSAPP_APP_SECRET not set: incoming messages and delivery receipts are ignored.');

  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    console.warn('WHATSAPP_BUSINESS_ACCOUNT_ID not set: skipping the WhatsApp template status check.');
    return;
  }
  try {
    const statuses = await fetchTemplateStatuses();
    for (const t of templates) {
      for (const lang of templateLanguages(t)) {
        const status = statuses.get(templateKey(t.name, lang));
        if (status === 'APPROVED') continue;
        // Hindi messages fall back to the default language, so a missing Hindi template is only a note
        const log = lang === HINDI ? console.log : console.warn;
        log(
          `WhatsApp template "${t.name}" (${lang}) is ${status || 'MISSING'}` +
            (lang === HINDI ? ': Hindi patients get the English version for now.' : ': those messages will fail. ') +
            (lang === HINDI ? '' : status ? 'Wait for Meta approval or check WhatsApp Manager.' : 'Run `npm run whatsapp:templates`.'),
        );
      }
    }
  } catch (err) {
    console.error(`WhatsApp template check failed: ${err.message}`);
  }
}

export const templateKey = (name, language) => `${name}|${language}`;

// 'name|language' -> status (APPROVED, PENDING, REJECTED, ...)
export async function fetchTemplateStatuses() {
  const statuses = new Map();
  let path = `${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,status,language&limit=200`;
  while (path) {
    const page = await graphRequest(path);
    for (const t of page.data || []) statuses.set(templateKey(t.name, t.language), t.status);
    path = page.paging?.next || null;
  }
  return statuses;
}
