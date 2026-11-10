import env from '../../config/env.js';
import Appointment from './appointment.model.js';
import { addDays, clinicNow } from './slots.js';
import * as whatsapp from './appointment.whatsapp.js';
import { notifyWhatsApp } from '../whatsapp/whatsapp.service.js';

// WhatsApp reminders, checked every few minutes. Each booking is claimed with an atomic update before its
// message goes out, so a reminder is sent once even if the server restarts or two checks overlap.

const INTERVAL_MS = 5 * 60 * 1000;
// No reminders late at night: only from REMINDER_HOUR until this hour (IST)
const LAST_HOUR = 21;
// Booked in the last few hours: the confirmation just went out, a reminder would be noise
const MIN_NOTICE_MS = 3 * 60 * 60 * 1000;

async function claim(filter, field) {
  const candidates = await Appointment.find({ ...filter, [field]: null }).select('_id').limit(500).lean();
  const claimed = [];
  for (const { _id } of candidates) {
    const appointment = await Appointment.findOneAndUpdate({ _id, [field]: null }, { $set: { [field]: new Date() } }, { returnDocument: 'after' });
    if (appointment) claimed.push(appointment);
  }
  return claimed;
}

const send = (appointment, message) =>
  notifyWhatsApp(appointment.phone, message, { name: appointment.patientName, patient: appointment.patient, related: { appointment: appointment._id } });

export async function runReminders(now = new Date()) {
  const { date, minutes } = clinicNow(now);
  if (minutes < env.REMINDER_HOUR * 60 || minutes >= Math.max(LAST_HOUR, env.REMINDER_HOUR + 1) * 60) return { reminders: 0, nextVisits: 0 };
  const tomorrow = addDays(date, 1);

  // Tomorrow's bookings: reminder with "I'll be there" / "Need to change" buttons
  const reminders = await claim(
    { date: tomorrow, status: 'confirmed', active: true, createdAt: { $lt: new Date(now.getTime() - MIN_NOTICE_MS) } },
    'reminderSentAt',
  );
  for (const a of reminders) send(a, whatsapp.reminderMessage(a));

  // Cancelled bookings whose "next visit" day is tomorrow
  const nextVisits = await claim({ nextVisitDate: tomorrow, status: 'cancelled' }, 'nextVisitReminderSentAt');
  for (const a of nextVisits) {
    // Already booked for that day: the appointment reminder covers it
    if (await Appointment.exists({ phoneKey: a.phoneKey, date: a.nextVisitDate, active: true })) continue;
    send(a, whatsapp.nextVisitReminderMessage(a));
  }

  if (reminders.length || nextVisits.length) {
    console.log(`WhatsApp reminders: ${reminders.length} appointment, ${nextVisits.length} next-visit`);
  }
  return { reminders: reminders.length, nextVisits: nextVisits.length };
}

export function startReminders() {
  if (!env.REMINDERS_ENABLED) {
    console.log('Appointment reminders are off (REMINDERS_ENABLED=false).');
    return;
  }
  const run = () => runReminders().catch((err) => console.error(`Appointment reminders failed: ${err.message}`));
  setTimeout(run, 30 * 1000).unref();
  setInterval(run, INTERVAL_MS).unref();
}
