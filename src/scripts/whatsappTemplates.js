// Submits the WhatsApp message templates to Meta for approval and shows their status.
// Each template is created in WHATSAPP_TEMPLATE_LANG, and also in Hindi when it has a Hindi body.
// Templates that already exist are left alone. Usage: npm run whatsapp:templates
import env from '../config/env.js';
import { fetchTemplateStatuses, graphRequest, templateKey, templateLanguages, whatsappConfigured, HINDI } from '../config/whatsapp.js';
import { ALL_TEMPLATES } from '../modules/whatsapp/templates.js';

// A one-page PDF built on the fly: Meta needs an example document for templates with a DOCUMENT header
function samplePdf() {
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    null, // content stream, below
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const content = 'BT /F1 20 Tf 72 760 Td (Ejaz Hospital) Tj 0 -32 Td /F1 14 Tf (Sample patient report) Tj ET';
  objects[3] = `<</Length ${content.length}>>\nstream\n${content}\nendstream`;
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// Meta's resumable upload: returns the file handle used as the header example
async function uploadHeaderSample(fileName) {
  if (!env.WHATSAPP_APP_ID) throw new Error('Set WHATSAPP_APP_ID in .env (App dashboard > App settings > Basic) to create templates with a document');
  const file = samplePdf();
  const session = await graphRequest(
    `${env.WHATSAPP_APP_ID}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${file.length}&file_type=application/pdf`,
    { method: 'POST' },
  );
  const res = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${session.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${env.WHATSAPP_ACCESS_TOKEN}`, file_offset: '0' },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.h) throw new Error(data.error?.message || `Sample upload failed (HTTP ${res.status})`);
  return data.h;
}

async function components(template, language) {
  const hindi = language === HINDI;
  const list = [];
  if (template.header === 'DOCUMENT') {
    list.push({ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [await uploadHeaderSample(template.headerSample)] } });
  }
  list.push({ type: 'BODY', text: hindi ? template.bodyHi : template.body, example: { body_text: [template.example] } });
  const buttons = (hindi && template.buttonsHi) || template.buttons;
  if (buttons?.length) list.push({ type: 'BUTTONS', buttons: buttons.map((text) => ({ type: 'QUICK_REPLY', text })) });
  return list;
}

async function run() {
  if (!whatsappConfigured || !env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    throw new Error('Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID in .env');
  }

  const existing = await fetchTemplateStatuses();
  for (const template of ALL_TEMPLATES) {
    for (const language of templateLanguages(template)) {
      const label = `${template.name} (${language})`;
      const status = existing.get(templateKey(template.name, language));
      if (status) {
        console.log(`${label}: already exists (${status})`);
        continue;
      }
      try {
        const created = await graphRequest(`${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`, {
          method: 'POST',
          body: { name: template.name, language, category: 'UTILITY', components: await components(template, language) },
        });
        console.log(`${label}: submitted (${created.status || 'PENDING'}${created.category ? `, ${created.category}` : ''})`);
      } catch (err) {
        process.exitCode = 1;
        console.error(`${label}: failed - ${err.message}`);
      }
    }
  }

  console.log('\nMeta reviews new templates, usually within minutes (up to 24 hours).');
  console.log('Run this again to see their status. Messages only send once a template is APPROVED.');
  console.log('Until a Hindi template is approved, Hindi-speaking patients get the English one.');
}

run().catch((err) => {
  console.error('WhatsApp template setup failed:', err.message);
  process.exitCode = 1;
});
