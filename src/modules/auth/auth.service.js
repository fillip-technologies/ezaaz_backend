import env from '../../config/env.js';
import { sendMail } from '../../config/mailer.js';
import Admin, { hashToken } from '../admin/admin.model.js';
import ApiError from '../../shared/utils/ApiError.js';
import { signToken } from '../../shared/middlewares/auth.js';
import { passwordResetEmail } from './auth.emails.js';

// Inputs are coerced to strings so objects like { "$ne": null } can't reach the query
export async function login({ email, password }) {
  if (!email || !password) throw ApiError.badRequest('Email and password are required');

  const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
  if (!admin || !(await admin.comparePassword(String(password)))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  admin.lastLoginAt = new Date();
  await admin.save({ validateModifiedOnly: true });

  return { token: signToken(admin), admin };
}

// Always resolves the same way so callers can't tell whether the email exists
export async function forgotPassword({ email }) {
  if (!email) throw ApiError.badRequest('Email is required');

  const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });
  if (!admin) return;

  const token = admin.createPasswordResetToken(env.RESET_TOKEN_TTL_MINUTES);
  await admin.save({ validateModifiedOnly: true });

  const resetUrl = `${env.CLIENT_URL}/master/reset-password?token=${token}`;
  try {
    await sendMail({
      to: admin.email,
      ...passwordResetEmail({ name: admin.name, resetUrl, ttlMinutes: env.RESET_TOKEN_TTL_MINUTES }),
    });
  } catch (err) {
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    await admin.save({ validateModifiedOnly: true });
    console.error('Failed to send password reset email:', err.message);
    throw new ApiError(500, 'Could not send the reset email, please try again later');
  }
}

export async function resetPassword({ token, password }) {
  if (!token || !password) throw ApiError.badRequest('Token and new password are required');

  const admin = await Admin.findOne({
    passwordResetToken: hashToken(String(token)),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!admin) throw ApiError.badRequest('Reset link is invalid or has expired');

  admin.password = String(password);
  admin.passwordResetToken = undefined;
  admin.passwordResetExpires = undefined;
  await admin.save();

  return { token: signToken(admin), admin };
}

export async function changePassword(adminId, { currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('Current and new password are required');
  }
  const admin = await Admin.findById(adminId).select('+password');
  if (!(await admin.comparePassword(String(currentPassword)))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  admin.password = String(newPassword);
  await admin.save();

  return { token: signToken(admin), admin };
}

// Name and email only; the email is where password reset links are sent
export async function updateProfile(adminId, { name, email }) {
  const admin = await Admin.findById(adminId);
  if (name !== undefined) admin.name = String(name);
  if (email !== undefined) admin.email = String(email);
  return admin.save();
}
