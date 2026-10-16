import nodemailer from 'nodemailer';
import env from './env.js';

const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

if (!smtpConfigured && env.NODE_ENV === 'production') {
  console.error('SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.');
  process.exit(1);
}

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export async function verifyMailer() {
  if (!transporter) {
    console.warn('SMTP not configured: emails will be printed to the console instead of sent.');
    return;
  }
  try {
    await transporter.verify();
    console.log(`SMTP ready: ${env.SMTP_HOST}:${env.SMTP_PORT}`);
  } catch (err) {
    console.error(`SMTP verification failed: ${err.message}`);
  }
}

export async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`\n--- Email (not sent, SMTP not configured) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---\n`);
    return;
  }
  await transporter.sendMail({ from: env.MAIL_FROM, to, subject, html, text });
}
