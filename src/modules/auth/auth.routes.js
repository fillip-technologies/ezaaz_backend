import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from './auth.controller.js';
import { protect } from '../../shared/middlewares/auth.js';

const router = Router();

const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts, please try again later' },
  });

router.post('/login', limiter(10), authController.login);
router.post('/forgot-password', limiter(5), authController.forgotPassword);
router.post('/reset-password', limiter(10), authController.resetPassword);

router.get('/me', protect, authController.me);
router.patch('/profile', protect, authController.updateProfile);
router.patch('/change-password', protect, authController.changePassword);

export default router;
