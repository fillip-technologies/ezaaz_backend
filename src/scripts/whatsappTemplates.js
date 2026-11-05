// Submits the WhatsApp message templates to Meta for approval and shows their status.
// Templates that already exist are left alone. Usage: npm run whatsapp:templates
import env from '../config/env.js';
import { fetchTemplateStatuses, graphRequest, whatsappConfigured } from '../config/whatsapp.js';
import { TEMPLATES } from '../modules/appointment/appointment.whatsapp.js';

async function run() {
  if (!whatsappConfigured || !env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    throw new Error('Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID in .env');
  }

  const existing = await fetchTemplateStatuses();
  for (const template of Object.values(TEMPLATES)) {
    if (existing.has(template.name)) {
      console.log(`${template.name}: already exists (${existing.get(template.name)})`);
      continue;
    }
    try {
      const created = await graphRequest(`${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`, {
        method: 'POST',
        body: {
          name: template.name,
          language: env.WHATSAPP_TEMPLATE_LANG,
          category: 'UTILITY',
          components: [{ type: 'BODY', text: template.body, example: { body_text: [template.example] } }],
        },
      });
      console.log(`${template.name}: submitted (${created.status || 'PENDING'}${created.category ? `, ${created.category}` : ''})`);
    } catch (err) {
      process.exitCode = 1;
      console.error(`${template.name}: failed - ${err.message}`);
    }
  }

  console.log('\nMeta reviews new templates, usually within minutes (up to 24 hours).');
  console.log('Run this again to see their status. Messages only send once a template is APPROVED.');
}

run().catch((err) => {
  console.error('WhatsApp template setup failed:', err.message);
  process.exitCode = 1;
});
