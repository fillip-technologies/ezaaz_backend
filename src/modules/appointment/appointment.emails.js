import env from '../../config/env.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const HOSPITAL = 'Ejaz Hospital';

export function formatDate(date) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function formatTime(time) {
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function layout(heading, paragraphs, rows) {
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#64748b;width:140px">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:32px 16px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
      <div style="background:#003a70;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold">${HOSPITAL}</div>
      <div style="padding:28px;color:#0f172a;font-size:15px;line-height:1.6">
        <p style="margin:0 0 12px;font-size:17px;font-weight:bold">${escapeHtml(heading)}</p>
        ${paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('')}
        <table style="width:100%;border-collapse:collapse;font-size:14px">${table}</table>
      </div>
    </div>
  </div>`;
}

const text = (heading, paragraphs, rows) =>
  [heading, '', ...paragraphs, '', ...rows.map(([label, value]) => `${label}: ${value}`)].join('\n');

const bookingRows = (a) => [
  ['Reference', a.ref],
  ['Doctor', a.doctorName],
  ['Date', formatDate(a.date)],
  ['Time', formatTime(a.time)],
];

function build(subject, heading, paragraphs, rows) {
  return { subject, html: layout(heading, paragraphs, rows), text: text(heading, paragraphs, rows) };
}

// To the patient, right after booking
export function requestReceivedEmail(a) {
  return build(
    `Appointment request ${a.ref} received`,
    `Hi ${a.patientName}, we've received your appointment request`,
    ['Your time slot is held for you. Our team will call or email you shortly to confirm it.'],
    bookingRows(a),
  );
}

export function confirmedEmail(a) {
  return build(
    `Appointment ${a.ref} confirmed`,
    `Hi ${a.patientName}, your appointment is confirmed`,
    ['Please arrive 15 minutes early and bring any previous reports or prescriptions.'],
    bookingRows(a),
  );
}

export function rescheduledEmail(a) {
  return build(
    `Appointment ${a.ref} rescheduled`,
    `Hi ${a.patientName}, your appointment has a new time`,
    ['If this time doesn\'t work for you, please call the hospital.'],
    bookingRows(a),
  );
}

export function cancelledEmail(a) {
  return build(
    `Appointment ${a.ref} cancelled`,
    `Hi ${a.patientName}, your appointment has been cancelled`,
    [a.cancelReason ? `Reason: ${a.cancelReason}` : 'Please call the hospital if you would like to book another time.'],
    bookingRows(a),
  );
}

// To the hospital, for every new request
export function newRequestEmail(a) {
  return build(
    `New appointment request: ${a.patientName}, ${formatDate(a.date)} ${formatTime(a.time)}`,
    'New appointment request',
    [`Confirm or cancel it in the admin panel: ${env.CLIENT_URL}/master/appointments`],
    [
      ...bookingRows(a),
      ['Patient', a.patientName],
      ['Phone', a.phone],
      ['Email', a.email || '—'],
      ['Age / gender', `${a.age ?? '—'} / ${a.gender}`],
      ['Notes', a.notes || '—'],
    ],
  );
}
