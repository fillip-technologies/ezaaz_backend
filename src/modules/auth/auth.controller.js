import * as authService from './auth.service.js';

export async function login(req, res) {
  const data = await authService.login(req.body ?? {});
  res.json({ success: true, data });
}

export function me(req, res) {
  res.json({ success: true, data: req.admin });
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.body ?? {});
  res.json({
    success: true,
    message: 'If an account exists for that email, a password reset link has been sent.',
  });
}

export async function resetPassword(req, res) {
  const data = await authService.resetPassword(req.body ?? {});
  res.json({ success: true, message: 'Password has been reset', data });
}

export async function updateProfile(req, res) {
  const admin = await authService.updateProfile(req.admin.id, req.body ?? {});
  res.json({ success: true, message: 'Profile updated', data: admin });
}

export async function changePassword(req, res) {
  const data = await authService.changePassword(req.admin.id, req.body ?? {});
  res.json({ success: true, message: 'Password changed', data });
}
