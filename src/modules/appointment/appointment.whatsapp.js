import { formatDate, formatTime } from './appointment.emails.js';

// WhatsApp message templates. Each one is defined only here: the sender fills {{1}}, {{2}}, ... in order
// and `npm run whatsapp:templates` submits exactly this text to Meta for approval.
// Changing a body (or the order of its variables) means re-approving it: delete the template in
// WhatsApp Manager and run the script again (or use a new name).
// Meta rules: a body can't start or end with a variable, and every variable needs an example.

export const TEMPLATES = {
  confirmed: {
    name: 'ezaaz_appointment_confirmed',
    body: [
      'Hi {{1}}, your appointment at Ejaz Hospital is confirmed.',
      '',
      'Reference: {{2}}',
      'Doctor: {{3}}',
      'Date: {{4}}',
      'Time: {{5}}',
      '',
      'Please arrive 15 minutes early and bring any previous reports or prescriptions.',
    ].join('\n'),
    example: ['Rahul Kumar', 'EJZ-7K3M9Q', 'Dr. Asha Verma', 'Mon, 10 November 2026', '10:30 AM'],
  },
  rescheduled: {
    name: 'ezaaz_appointment_rescheduled',
    body: [
      'Hi {{1}}, your appointment at Ejaz Hospital has a new time.',
      '',
      'Reference: {{2}}',
      'Doctor: {{3}}',
      'Date: {{4}}',
      'Time: {{5}}',
      '',
      "If this time doesn't work for you, please call the hospital.",
    ].join('\n'),
    example: ['Rahul Kumar', 'EJZ-7K3M9Q', 'Dr. Asha Verma', 'Wed, 12 November 2026', '11:00 AM'],
  },
  cancelled: {
    name: 'ezaaz_appointment_cancelled',
    body: [
      'Hi {{1}}, your appointment at Ejaz Hospital has been cancelled.',
      '',
      'Reference: {{2}}',
      'Doctor: {{3}}',
      'Date: {{4}}',
      'Time: {{5}}',
      '',
      'Details: {{6}}',
      '',
      'Thank you.',
    ].join('\n'),
    example: [
      'Rahul Kumar',
      'EJZ-7K3M9Q',
      'Dr. Asha Verma',
      'Mon, 10 November 2026',
      '10:30 AM',
      'Please call the hospital if you would like to book another time.',
    ],
    maxParamLength: 500,
  },
  doctorUnavailable: {
    name: 'ezaaz_doctor_unavailable',
    body: [
      'Hi {{1}}, {{2}} will not be available at your appointment time at Ejaz Hospital.',
      '',
      'Reference: {{3}}',
      'Date: {{4}}',
      'Time: {{5}}',
      '',
      'We are sorry, but due to an unavoidable reason the doctor cannot attend on your booked date. ' +
        'Please do not come to the hospital for this appointment. Our team will inform you shortly of your new appointment time.',
    ].join('\n'),
    example: ['Rahul Kumar', 'Dr. Asha Verma', 'EJZ-7K3M9Q', 'Mon, 10 November 2026', '10:30 AM'],
  },
  newBooking: {
    name: 'ezaaz_new_booking_alert',
    body: [
      'New appointment booked at Ejaz Hospital.',
      '',
      'Reference: {{1}}',
      'Doctor: {{2}}',
      'Date: {{3}}',
      'Time: {{4}}',
      'Patient: {{5}}',
      'Phone: {{6}}',
      'Email: {{7}}',
      'Age / gender: {{8}}',
      'Notes: {{9}}',
      '',
      'The slot is now taken. To free it, cancel the booking in the admin panel.',
    ].join('\n'),
    example: [
      'EJZ-7K3M9Q',
      'Dr. Asha Verma',
      'Mon, 10 November 2026',
      '10:30 AM',
      'Rahul Kumar',
      '9876543210',
      'rahul@example.com',
      '34 / male',
      'Follow-up for knee pain',
    ],
    maxParamLength: 300,
  },
};

const message = (template, params) => ({ template, params });

// To the patient, right after booking (bookings are confirmed automatically)
export const confirmedMessage = (a) =>
  message(TEMPLATES.confirmed, [a.patientName, a.ref, a.doctorName, formatDate(a.date), formatTime(a.time)]);

export const rescheduledMessage = (a) =>
  message(TEMPLATES.rescheduled, [a.patientName, a.ref, a.doctorName, formatDate(a.date), formatTime(a.time)]);

export function cancelledMessage(a) {
  const details = [
    ...(a.cancelReason ? [`Reason: ${a.cancelReason}.`] : []),
    a.nextVisitDate
      ? `Please visit the hospital on ${formatDate(a.nextVisitDate)} to be checked by ${a.doctorName}.`
      : 'Please call the hospital if you would like to book another time.',
  ].join(' ');
  return message(TEMPLATES.cancelled, [a.patientName, a.ref, a.doctorName, formatDate(a.date), formatTime(a.time), details]);
}

// To each patient whose booking falls inside newly added doctor leave / hospital holiday
export const doctorUnavailableMessage = (a) =>
  message(TEMPLATES.doctorUnavailable, [a.patientName, a.doctorName, a.ref, formatDate(a.date), formatTime(a.time)]);

// To the hospital staff numbers, for every new booking
export const newBookingMessage = (a) =>
  message(TEMPLATES.newBooking, [
    a.ref,
    a.doctorName,
    formatDate(a.date),
    formatTime(a.time),
    a.patientName,
    a.phone,
    a.email,
    `${a.age ?? '—'} / ${a.gender}`,
    a.notes,
  ]);
