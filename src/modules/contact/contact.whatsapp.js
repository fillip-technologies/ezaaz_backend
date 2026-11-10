// WhatsApp templates for website enquiry forms (see appointment.whatsapp.js for the rules)

export const TEMPLATES = {
  enquiryReceived: {
    name: 'ezaaz_enquiry_received',
    body: [
      'Hi {{1}}, thank you for contacting Ejaz Hospital. We have received your message about {{2}}.',
      '',
      'Our team will call you or reply here on WhatsApp soon. For an emergency, please call {{3}}.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल से संपर्क करने के लिए धन्यवाद। {{2}} के बारे में आपका मैसेज हमें मिल गया है।',
      '',
      'हमारी टीम जल्द ही आपको कॉल करेगी या यहाँ WhatsApp पर जवाब देगी। इमरजेंसी में कृपया {{3}} पर कॉल करें।',
    ].join('\n'),
    example: ['Rahul Kumar', 'Hernia Surgery', '+91 6203 770 070'],
  },
  newEnquiry: {
    name: 'ezaaz_new_enquiry_alert',
    body: [
      'New enquiry on the Ejaz Hospital website.',
      '',
      'Name: {{1}}',
      'Phone: {{2}}',
      'About: {{3}}',
      'Form: {{4}}',
      'Message: {{5}}',
      '',
      'Reply from the admin panel under Contact Forms or WhatsApp.',
    ].join('\n'),
    example: ['Rahul Kumar', '9876543210', 'Hernia Surgery / Dr. Asha Verma', 'Specialty page', 'Is laparoscopic surgery available?'],
    maxParamLength: 300,
  },
};

const SOURCE_LABELS = { contact: 'Contact page', home: 'Home page', specialty: 'Specialty page', doctors: 'Doctors page' };
const topic = (e, hi) => [e.page, e.departmentName, e.doctorName].filter(Boolean).join(' / ') || (hi ? 'आपकी पूछताछ' : 'your enquiry');

export const enquiryReceivedMessage = (e, emergencyPhone) => ({
  template: TEMPLATES.enquiryReceived,
  params: [e.fullName, topic(e, e.language === 'hi'), emergencyPhone],
  language: e.language,
  label: 'Enquiry received',
});

export const newEnquiryMessage = (e) => ({
  template: TEMPLATES.newEnquiry,
  params: [e.fullName, e.phone, topic(e), SOURCE_LABELS[e.source] || e.source, e.message],
  label: 'Staff alert',
});
