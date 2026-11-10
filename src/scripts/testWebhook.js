// Pretends to be Meta: posts a signed "incoming message" to the local webhook, so the inbox can be tried
// without a public URL. Needs WHATSAPP_APP_SECRET in .env (any value works locally).
// Usage: npm run whatsapp:webhook-test -- 9876543210 "Hi, when is my report ready?" [Profile name]
import crypto from 'node:crypto';
import env from '../config/env.js';
import { toWhatsAppNumber } from '../config/whatsapp.js';

async function run() {
  const [phone, text = 'Hello', name = 'Test Patient'] = process.argv.slice(2);
  const from = toWhatsAppNumber(phone);
  if (!from) throw new Error('Pass a mobile number, e.g. npm run whatsapp:webhook-test -- 9876543210 "Hello"');
  if (!env.WHATSAPP_APP_SECRET) throw new Error('Set WHATSAPP_APP_SECRET in .env (and restart the server) first');

  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: env.WHATSAPP_BUSINESS_ACCOUNT_ID || 'test',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: 'test', phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID || 'test' },
              contacts: [{ profile: { name }, wa_id: from }],
              messages: [{ from, id: `wamid.TEST${crypto.randomBytes(8).toString('hex')}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  });
  const signature = `sha256=${crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(body).digest('hex')}`;
  const res = await fetch(`http://localhost:${env.PORT}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
    body,
  });
  console.log(res.ok ? `Delivered "${text}" from ${from}. Open WhatsApp in the admin panel.` : `Webhook answered HTTP ${res.status}`);
}

run().catch((err) => {
  console.error('Webhook test failed:', err.message);
  process.exitCode = 1;
});
