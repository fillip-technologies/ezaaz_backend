// Sends a sample booking confirmation to one number to check the WhatsApp setup.
// Usage: npm run whatsapp:test -- 9876543210
import { sendTemplate, toWhatsAppNumber, verifyWhatsApp, whatsappConfigured } from '../config/whatsapp.js';
import { confirmedMessage } from '../modules/appointment/appointment.whatsapp.js';
import { ALL_TEMPLATES } from '../modules/whatsapp/templates.js';
import { clinicNow } from '../modules/appointment/slots.js';

async function run() {
  const to = toWhatsAppNumber(process.argv[2]);
  if (!to) throw new Error('Pass a mobile number, e.g. npm run whatsapp:test -- 9876543210');

  await verifyWhatsApp(ALL_TEMPLATES);

  const sample = {
    patientName: 'Test Patient',
    ref: 'EJZ-TEST00',
    doctorName: 'Dr. Test',
    date: clinicNow().date,
    time: '10:30',
  };
  const id = await sendTemplate(to, confirmedMessage(sample));
  if (whatsappConfigured) {
    console.log(`Accepted by Meta for ${to} (message id ${id}).`);
    console.log('If it does not arrive: check the number is on WhatsApp, and with the test number, that it is an allowed recipient.');
  }
}

run().catch((err) => {
  console.error('WhatsApp test failed:', err.message);
  process.exitCode = 1;
});
