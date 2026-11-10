import env from '../../config/env.js';
import { formatDate, formatTime } from './appointment.emails.js';

// WhatsApp message templates for bookings. Each one is defined only here: the sender fills {{1}}, {{2}}, ... in order
// and `npm run whatsapp:templates` submits exactly this text to Meta for approval (in English, and in Hindi
// for templates with `bodyHi`; patients who booked in Hindi get the Hindi version once Meta approves it).
// Changing a body (or the order of its variables) means re-approving it: delete the template in
// WhatsApp Manager and run the script again (or use a new name).
// Meta rules: a body can't start or end with a variable, and every variable needs an example.
// `buttons` are quick replies; the payload each sends back is set per message (see buttonPayloads below).

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
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल में आपका अपॉइंटमेंट कन्फर्म हो गया है।',
      '',
      'रेफरेंस: {{2}}',
      'डॉक्टर: {{3}}',
      'तारीख: {{4}}',
      'समय: {{5}}',
      '',
      'कृपया 15 मिनट पहले पहुँचें और अपनी पुरानी रिपोर्ट या पर्चे साथ लाएँ।',
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
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल में आपके अपॉइंटमेंट का समय बदल गया है।',
      '',
      'रेफरेंस: {{2}}',
      'डॉक्टर: {{3}}',
      'तारीख: {{4}}',
      'समय: {{5}}',
      '',
      'अगर यह समय आपके लिए ठीक नहीं है, तो कृपया हॉस्पिटल को कॉल करें।',
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
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल में आपका अपॉइंटमेंट रद्द कर दिया गया है।',
      '',
      'रेफरेंस: {{2}}',
      'डॉक्टर: {{3}}',
      'तारीख: {{4}}',
      'समय: {{5}}',
      '',
      'जानकारी: {{6}}',
      '',
      'धन्यवाद।',
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
    bodyHi: [
      'नमस्ते {{1}}, {{2}} एजाज़ हॉस्पिटल में आपके अपॉइंटमेंट के समय उपलब्ध नहीं रहेंगे।',
      '',
      'रेफरेंस: {{3}}',
      'तारीख: {{4}}',
      'समय: {{5}}',
      '',
      'हमें खेद है, किसी अनिवार्य कारण से डॉक्टर आपकी बुक की गई तारीख पर उपलब्ध नहीं हैं। ' +
        'कृपया इस अपॉइंटमेंट के लिए हॉस्पिटल न आएँ। हमारी टीम जल्द ही आपको नया समय बताएगी।',
    ].join('\n'),
    example: ['Rahul Kumar', 'Dr. Asha Verma', 'EJZ-7K3M9Q', 'Mon, 10 November 2026', '10:30 AM'],
  },
  // A leave / holiday was removed: patients told not to come can come after all
  backOn: {
    name: 'ezaaz_appointment_back_on',
    body: [
      'Hi {{1}}, good news: {{2}} is available again, so your appointment at Ejaz Hospital is going ahead as booked.',
      '',
      'Reference: {{3}}',
      'Date: {{4}}',
      'Time: {{5}}',
      '',
      'Please arrive 15 minutes early. Ignore our earlier message about this appointment.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, अच्छी खबर: {{2}} फिर से उपलब्ध हैं, इसलिए एजाज़ हॉस्पिटल में आपका अपॉइंटमेंट पहले जैसा ही रहेगा।',
      '',
      'रेफरेंस: {{3}}',
      'तारीख: {{4}}',
      'समय: {{5}}',
      '',
      'कृपया 15 मिनट पहले पहुँचें। इस अपॉइंटमेंट के बारे में हमारा पिछला मैसेज अनदेखा करें।',
    ].join('\n'),
    example: ['Rahul Kumar', 'Dr. Asha Verma', 'EJZ-7K3M9Q', 'Mon, 10 November 2026', '10:30 AM'],
  },
  // The evening before (REMINDER_HOUR). The buttons come back to the webhook with the booking id.
  reminder: {
    name: 'ezaaz_appointment_reminder',
    body: [
      'Hi {{1}}, a reminder of your appointment at Ejaz Hospital tomorrow.',
      '',
      'Reference: {{2}}',
      'Doctor: {{3}}',
      'Date: {{4}}',
      'Time: {{5}}',
      '',
      'Please arrive 15 minutes early. Tap a button below to let us know if you are coming.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, कल एजाज़ हॉस्पिटल में आपके अपॉइंटमेंट की याद दिला रहे हैं।',
      '',
      'रेफरेंस: {{2}}',
      'डॉक्टर: {{3}}',
      'तारीख: {{4}}',
      'समय: {{5}}',
      '',
      'कृपया 15 मिनट पहले पहुँचें। आप आ रहे हैं या नहीं, नीचे बटन दबाकर बताएँ।',
    ].join('\n'),
    buttons: ["I'll be there", 'Need to change'],
    buttonsHi: ['हाँ, आ रहे हैं', 'समय बदलना है'],
    example: ['Rahul Kumar', 'EJZ-7K3M9Q', 'Dr. Asha Verma', 'Tue, 11 November 2026', '10:30 AM'],
  },
  // The day before the "next visit" date set when a booking was cancelled
  nextVisitReminder: {
    name: 'ezaaz_next_visit_reminder',
    body: [
      'Hi {{1}}, this is a reminder from Ejaz Hospital to visit tomorrow, {{2}}, to be checked by {{3}}.',
      '',
      'Reference: {{4}}',
      '',
      'Please call the hospital if you would like a fixed time.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल की ओर से याद दिला रहे हैं कि कल, {{2}} को {{3}} से जाँच के लिए आएँ।',
      '',
      'रेफरेंस: {{4}}',
      '',
      'तय समय चाहिए तो कृपया हॉस्पिटल को कॉल करें।',
    ].join('\n'),
    example: ['Rahul Kumar', 'Tue, 11 November 2026', 'Dr. Asha Verma', 'EJZ-7K3M9Q'],
  },
  // Admin marked the booking "No-show"
  missed: {
    name: 'ezaaz_missed_appointment',
    body: [
      'Hi {{1}}, we missed you at your appointment with {{2}} at Ejaz Hospital on {{3}}.',
      '',
      'Reference: {{4}}',
      '',
      'To book a new time, visit {{5}} or call the hospital. We hope you are well.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल में {{2}} के साथ आपका अपॉइंटमेंट ({{3}}) था, पर आप नहीं आ पाए।',
      '',
      'रेफरेंस: {{4}}',
      '',
      'नया समय बुक करने के लिए {{5}} पर जाएँ या हॉस्पिटल को कॉल करें। आशा है आप ठीक हैं।',
    ].join('\n'),
    example: ['Rahul Kumar', 'Dr. Asha Verma', 'Mon, 10 November 2026', 'EJZ-7K3M9Q', 'https://example.com/book-appointment'],
  },
  // Admin marked the booking "Completed"
  visitThanks: {
    name: 'ezaaz_visit_thanks',
    body: [
      'Hi {{1}}, thank you for visiting {{2}} at Ejaz Hospital.',
      '',
      '{{3}}',
      '',
      'Reply to this message if you have any questions. We wish you good health.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल में {{2}} से मिलने आने के लिए धन्यवाद।',
      '',
      '{{3}}',
      '',
      'कोई सवाल हो तो इस मैसेज का जवाब दें। आपके अच्छे स्वास्थ्य की कामना करते हैं।',
    ].join('\n'),
    example: ['Rahul Kumar', 'Dr. Asha Verma', 'Your next visit is on Mon, 24 November 2026. Tell us how your visit went: https://example.com/review'],
    maxParamLength: 400,
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
  // To staff numbers when a booking is cancelled or moved, or a patient asks to change it
  bookingChange: {
    name: 'ezaaz_booking_change_alert',
    body: [
      'Booking update at Ejaz Hospital: {{1}}.',
      '',
      'Reference: {{2}}',
      'Patient: {{3}}',
      'Phone: {{4}}',
      'Doctor: {{5}}',
      'Appointment: {{6}}',
      '',
      'Open the admin panel for the details.',
    ].join('\n'),
    example: ['cancelled', 'EJZ-7K3M9Q', 'Rahul Kumar', '9876543210', 'Dr. Asha Verma', 'Mon, 10 November 2026, 10:30 AM'],
  },
};

const message = (template, params, { language, label, buttonPayloads } = {}) => ({ template, params, language, label, buttonPayloads });
const when = (a, lang) => [formatDate(a.date, lang), formatTime(a.time)];

// To the patient, right after booking (bookings are confirmed automatically)
export const confirmedMessage = (a) =>
  message(TEMPLATES.confirmed, [a.patientName, a.ref, a.doctorName, ...when(a, a.language)], { language: a.language, label: 'Booking confirmed' });

export const rescheduledMessage = (a) =>
  message(TEMPLATES.rescheduled, [a.patientName, a.ref, a.doctorName, ...when(a, a.language)], { language: a.language, label: 'Booking moved' });

export function cancelledMessage(a) {
  const hi = a.language === 'hi';
  const details = [
    ...(a.cancelReason ? [hi ? `कारण: ${a.cancelReason}।` : `Reason: ${a.cancelReason}.`] : []),
    a.nextVisitDate
      ? hi
        ? `कृपया ${formatDate(a.nextVisitDate, 'hi')} को ${a.doctorName} से जाँच के लिए हॉस्पिटल आएँ।`
        : `Please visit the hospital on ${formatDate(a.nextVisitDate)} to be checked by ${a.doctorName}.`
      : hi
        ? 'दूसरा समय बुक करना हो तो कृपया हॉस्पिटल को कॉल करें।'
        : 'Please call the hospital if you would like to book another time.',
  ].join(' ');
  return message(TEMPLATES.cancelled, [a.patientName, a.ref, a.doctorName, ...when(a, a.language), details], {
    language: a.language,
    label: 'Booking cancelled',
  });
}

// To each patient whose booking falls inside newly added doctor leave / hospital holiday
export const doctorUnavailableMessage = (a) =>
  message(TEMPLATES.doctorUnavailable, [a.patientName, a.doctorName, a.ref, ...when(a, a.language)], {
    language: a.language,
    label: 'Doctor unavailable',
  });

// To the same patients when that leave / holiday is deleted again
export const backOnMessage = (a) =>
  message(TEMPLATES.backOn, [a.patientName, a.doctorName, a.ref, ...when(a, a.language)], { language: a.language, label: 'Booking back on' });

export const REMINDER_PAYLOAD = { confirm: 'CONFIRM', change: 'CHANGE' };
export const reminderMessage = (a) =>
  message(TEMPLATES.reminder, [a.patientName, a.ref, a.doctorName, ...when(a, a.language)], {
    language: a.language,
    label: 'Reminder',
    buttonPayloads: [`${REMINDER_PAYLOAD.confirm}:${a._id}`, `${REMINDER_PAYLOAD.change}:${a._id}`],
  });

export const nextVisitReminderMessage = (a) =>
  message(TEMPLATES.nextVisitReminder, [a.patientName, formatDate(a.nextVisitDate, a.language), a.doctorName, a.ref], {
    language: a.language,
    label: 'Next visit reminder',
  });

export const missedMessage = (a) =>
  message(TEMPLATES.missed, [a.patientName, a.doctorName, formatDate(a.date, a.language), a.ref, `${env.CLIENT_URL}/book-appointment`], {
    language: a.language,
    label: 'Missed appointment',
  });

export function visitThanksMessage(a, { followUpDate } = {}) {
  const hi = a.language === 'hi';
  const lines = [
    followUpDate
      ? hi
        ? `आपकी अगली विज़िट ${formatDate(followUpDate, 'hi')} को है।`
        : `Your next visit is on ${formatDate(followUpDate)}.`
      : hi
        ? 'अपनी दवाइयाँ डॉक्टर की सलाह के अनुसार लें।'
        : "Please take your medicines as the doctor advised.",
    ...(env.FEEDBACK_URL ? [hi ? `अपना अनुभव बताएँ: ${env.FEEDBACK_URL}` : `Tell us how your visit went: ${env.FEEDBACK_URL}`] : []),
  ];
  return message(TEMPLATES.visitThanks, [a.patientName, a.doctorName, lines.join(' ')], { language: a.language, label: 'After visit' });
}

// To the hospital staff numbers, for every new booking
export const newBookingMessage = (a) =>
  message(
    TEMPLATES.newBooking,
    [a.ref, a.doctorName, formatDate(a.date), formatTime(a.time), a.patientName, a.phone, a.email, `${a.age ?? '—'} / ${a.gender}`, a.notes],
    { label: 'Staff alert' },
  );

// To the hospital staff numbers: change = 'cancelled' | 'postponed' | 'patient asked to change the time' ...
export const bookingChangeMessage = (a, change) =>
  message(TEMPLATES.bookingChange, [change, a.ref, a.patientName, a.phone, a.doctorName, `${formatDate(a.date)}, ${formatTime(a.time)}`], {
    label: 'Staff alert',
  });
