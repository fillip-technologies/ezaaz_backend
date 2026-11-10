import { formatDate } from '../appointment/appointment.emails.js';

// WhatsApp templates for patient reports (see appointment.whatsapp.js for the rules).
// reportReady carries the report itself as a DOCUMENT header; `npm run whatsapp:templates` uploads
// `headerSample` to Meta as the example document it requires.

export const TEMPLATES = {
  // Number checked with the patient at the desk
  reportReady: {
    name: 'ezaaz_report_ready',
    header: 'DOCUMENT',
    headerSample: 'sample-report.pdf',
    body: [
      'Hi {{1}}, your {{2}} from Ejaz Hospital is attached.',
      '',
      'Patient ID: {{3}}',
      'Date: {{4}}',
      '',
      'Please share it with your doctor at your next visit. Reply to this message if you have any questions.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल से आपकी {{2}} साथ में भेजी गई है।',
      '',
      'पेशेंट आईडी: {{3}}',
      'तारीख: {{4}}',
      '',
      'अगली विज़िट पर इसे अपने डॉक्टर को दिखाएँ। कोई सवाल हो तो इस मैसेज का जवाब दें।',
    ].join('\n'),
    example: ['Rahul Kumar', 'CBC blood test report', 'EJZ-P-7K3M9Q', 'Mon, 10 November 2026'],
  },
  // Number never confirmed: no file until the patient taps the button (which proves the number is theirs)
  reportNotice: {
    name: 'ezaaz_report_ready_notice',
    body: [
      'Hi {{1}}, your {{2}} from Ejaz Hospital is ready.',
      '',
      'Patient ID: {{3}}',
      '',
      'Tap "Send my report" below to receive it here on WhatsApp, or collect it from the hospital.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल से आपकी {{2}} तैयार है।',
      '',
      'पेशेंट आईडी: {{3}}',
      '',
      'इसे यहाँ WhatsApp पर पाने के लिए नीचे "रिपोर्ट भेजें" दबाएँ, या हॉस्पिटल से ले जाएँ।',
    ].join('\n'),
    buttons: ['Send my report'],
    buttonsHi: ['रिपोर्ट भेजें'],
    example: ['Rahul Kumar', 'CBC blood test report', 'EJZ-P-7K3M9Q'],
  },
};

export const REPORT_PAYLOAD = 'REPORT';

const reportName = (report) => report.title || 'report';

export const reportReadyMessage = (patient, report, document) => ({
  template: TEMPLATES.reportReady,
  params: [patient.name, reportName(report), patient.uhid, formatDate(report.reportDate || new Date().toISOString().slice(0, 10), patient.language)],
  language: patient.language,
  header: { document },
  label: 'Report sent',
});

export const reportNoticeMessage = (patient, report) => ({
  template: TEMPLATES.reportNotice,
  params: [patient.name, reportName(report), patient.uhid],
  language: patient.language,
  buttonPayloads: [`${REPORT_PAYLOAD}:${report._id}`],
  label: 'Report ready',
});
