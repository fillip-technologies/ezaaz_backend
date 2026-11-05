import env from './env.js';

// WhatsApp Cloud API client. Messages the hospital starts must use a template that Meta has approved;
// templates are defined in modules/appointment/appointment.whatsapp.js and created with `npm run whatsapp:templates`.

export const whatsappConfigured = Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

const GRAPH_URL = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}`;
const TIMEOUT_MS = 10000;

// Calls the Graph API (a path, or a full paging URL) and throws a readable error (Meta's message, code and details) on failure
export async function graphRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(path.startsWith('https://') ? path : `${GRAPH_URL}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    const details = e.error_data?.details || e.error_user_msg;
    const err = new Error(`${e.message || `HTTP ${res.status}`}${e.code ? ` (code ${e.code})` : ''}${details ? `: ${details}` : ''}`);
    err.status = res.status;
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

export const renderTemplate = (template, params) => template.body.replace(/\{\{(\d+)\}\}/g, (_, i) => params[i - 1]);

// Meta rejects a message whose filled-in body is over 1024 characters: shorten the longest values until it fits
const MAX_BODY_LENGTH = 1024;
function fitBody(template, values) {
  const fitted = [...values];
  let excess = renderTemplate(template, fitted).length - MAX_BODY_LENGTH;
  while (excess > 0) {
    const i = fitted.reduce((longest, v, j) => (v.length > fitted[longest].length ? j : longest), 0);
    const keep = Math.max(1, fitted[i].length - excess - 1);
    fitted[i] = `${fitted[i].slice(0, keep)}…`;
    excess = renderTemplate(template, fitted).length - MAX_BODY_LENGTH;
  }
  return fitted;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Sends an approved template. `params` fill {{1}}, {{2}}, ... of the body in order.
// Returns Meta's message id. Retries once on rate limits and Meta server errors.
export async function sendTemplate(to, { template, params }) {
  const values = fitBody(template, params.map((p) => cleanParam(p, template.maxParamLength)));
  if (!whatsappConfigured) {
    console.log(`\n--- WhatsApp (not sent, WhatsApp not configured) ---\nTo: ${to}\nTemplate: ${template.name}\n\n${renderTemplate(template, values)}\n---\n`);
    return null;
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: env.WHATSAPP_TEMPLATE_LANG },
      components: [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }],
    },
  };

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

  if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    console.warn('WHATSAPP_BUSINESS_ACCOUNT_ID not set: skipping the WhatsApp template status check.');
    return;
  }
  try {
    const statuses = await fetchTemplateStatuses();
    for (const t of templates) {
      const status = statuses.get(t.name);
      if (status !== 'APPROVED') {
        console.warn(
          `WhatsApp template "${t.name}" (${env.WHATSAPP_TEMPLATE_LANG}) is ${status || 'MISSING'}: those messages will fail. ` +
            (status ? 'Wait for Meta approval or check WhatsApp Manager.' : 'Run `npm run whatsapp:templates`.'),
        );
      }
    }
  } catch (err) {
    console.error(`WhatsApp template check failed: ${err.message}`);
  }
}

// Template name -> status (APPROVED, PENDING, REJECTED, ...) for the configured language
export async function fetchTemplateStatuses() {
  const statuses = new Map();
  let path = `${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,status,language&limit=200`;
  while (path) {
    const page = await graphRequest(path);
    for (const t of page.data || []) if (t.language === env.WHATSAPP_TEMPLATE_LANG) statuses.set(t.name, t.status);
    path = page.paging?.next || null;
  }
  return statuses;
}
