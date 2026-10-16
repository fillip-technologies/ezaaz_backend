import jwt from 'jsonwebtoken';
import env from '../../config/env.js';
import Admin from '../../modules/admin/admin.model.js';
import ApiError from '../utils/ApiError.js';

export function signToken(admin) {
  return jwt.sign({ sub: admin.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

// Requires `Authorization: Bearer <token>`; attaches the admin to req.admin
export async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Session expired or invalid, please log in again');
  }

  const admin = await Admin.findById(payload.sub).select('+passwordChangedAt');
  if (!admin) throw ApiError.unauthorized('Account not found');
  if (admin.changedPasswordAfter(payload.iat)) {
    throw ApiError.unauthorized('Password was changed, please log in again');
  }

  req.admin = admin;
  next();
}
