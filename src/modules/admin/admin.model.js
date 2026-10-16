import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// The single site administrator who signs in at /master
const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    lastLoginAt: Date,
    passwordChangedAt: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.passwordChangedAt;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.__v;
        return ret;
      },
    },
  },
);

adminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
});

adminSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// True if the password changed after the JWT was issued (iat is in seconds)
adminSchema.methods.changedPasswordAfter = function (jwtIssuedAt) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtIssuedAt;
};

// Returns the raw token (to email); only its hash is stored
adminSchema.methods.createPasswordResetToken = function (ttlMinutes) {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = hashToken(token);
  this.passwordResetExpires = new Date(Date.now() + ttlMinutes * 60 * 1000);
  return token;
};

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
