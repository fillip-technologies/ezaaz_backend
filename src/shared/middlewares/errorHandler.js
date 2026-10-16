import mongoose from 'mongoose';
import multer from 'multer';
import env from '../../config/env.js';

// Maps mongoose / MongoDB errors to HTTP responses. Must be registered last.
export default function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    // Use the error key: for nested fields it's the full path (e.g. "name.en"), unlike e.path
    details = Object.entries(err.errors).map(([field, e]) => ({ field, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    message = `Duplicate value for: ${Object.keys(err.keyValue || {}).join(', ')}`;
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    message =
      err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${req.uploadLimitMb ?? env.MAX_UPLOAD_MB} MB)` : err.message;
  }

  if (statusCode >= 500) console.error(err);

  res.status(statusCode).json({
    success: false,
    message,
    ...(details && { details }),
    ...(env.NODE_ENV === 'development' && statusCode >= 500 && { stack: err.stack }),
  });
}
