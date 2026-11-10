// Templates staff can send by hand from the inbox, e.g. to start a chat or reopen one after 24 hours.
// `fields` are what the template picker asks for; `{{1}}` is always the patient's name.

export const TEMPLATES = {
  followUp: {
    name: 'ezaaz_staff_follow_up',
    body: [
      'Hi {{1}}, this is Ejaz Hospital about {{2}}.',
      '',
      'Please reply to this message so our team can continue helping you here on WhatsApp.',
    ].join('\n'),
    bodyHi: [
      'नमस्ते {{1}}, एजाज़ हॉस्पिटल से {{2}} के बारे में संपर्क कर रहे हैं।',
      '',
      'कृपया इस मैसेज का जवाब दें, ताकि हमारी टीम यहाँ WhatsApp पर आपकी मदद कर सके।',
    ].join('\n'),
    example: ['Rahul Kumar', 'your appointment on Monday'],
    manual: {
      label: 'Follow-up (start or reopen a chat)',
      fields: [
        { key: 'name', label: 'Patient name' },
        { key: 'topic', label: 'About', placeholder: 'e.g. your appointment on Monday, your test results' },
      ],
    },
  },
};
