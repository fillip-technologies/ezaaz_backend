import { TEMPLATES as APPOINTMENT_TEMPLATES } from '../appointment/appointment.whatsapp.js';
import { TEMPLATES as CONTACT_TEMPLATES } from '../contact/contact.whatsapp.js';
import { TEMPLATES as PATIENT_TEMPLATES } from '../patient/patient.whatsapp.js';
import { TEMPLATES as INBOX_TEMPLATES } from './inbox.templates.js';

// Every WhatsApp template the app sends: checked on startup and submitted by `npm run whatsapp:templates`
export const ALL_TEMPLATES = [
  ...Object.values(APPOINTMENT_TEMPLATES),
  ...Object.values(CONTACT_TEMPLATES),
  ...Object.values(PATIENT_TEMPLATES),
  ...Object.values(INBOX_TEMPLATES),
];

// Templates staff can pick in the inbox, by key
export const MANUAL_TEMPLATES = INBOX_TEMPLATES;
