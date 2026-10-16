function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function passwordResetEmail({ name, resetUrl, ttlMinutes }) {
  const subject = 'Reset your Ejaz Hospital admin password';

  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset the password for your Ejaz Hospital admin account.',
    `Open the link below to choose a new password. It expires in ${ttlMinutes} minutes.`,
    '',
    resetUrl,
    '',
    "If you didn't request this, you can ignore this email; your password won't change.",
  ].join('\n');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:32px 16px">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
      <div style="background:#003a70;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold">Ejaz Hospital Admin</div>
      <div style="padding:28px;color:#0f172a;font-size:15px;line-height:1.6">
        <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
        <p style="margin:0 0 20px">We received a request to reset the password for your admin account. This link expires in ${ttlMinutes} minutes.</p>
        <p style="margin:0 0 24px">
          <a href="${resetUrl}" style="display:inline-block;background:#0091da;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Reset password</a>
        </p>
        <p style="margin:0 0 8px;color:#475569;font-size:13px">Or paste this link into your browser:</p>
        <p style="margin:0 0 20px;word-break:break-all;font-size:13px"><a href="${resetUrl}" style="color:#0091da">${resetUrl}</a></p>
        <p style="margin:0;color:#64748b;font-size:13px">If you didn't request this, you can ignore this email; your password won't change.</p>
      </div>
    </div>
  </div>`;

  return { subject, text, html };
}
