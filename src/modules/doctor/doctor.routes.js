import { Router } from 'express';
import * as doctorController from './doctor.controller.js';
import { PHOTO_FOLDER } from './doctor.service.js';
import { protect } from '../../shared/middlewares/auth.js';
import { imageUpload } from '../../shared/middlewares/upload.js';

// Website: active doctors only (Redis first, then MongoDB)
export const publicDoctorRoutes = Router();
publicDoctorRoutes.get('/', doctorController.listPublic);
publicDoctorRoutes.get('/:slug', doctorController.getPublic);

// Admin panel: full CRUD, including hidden doctors
export const adminDoctorRoutes = Router();
adminDoctorRoutes.use(protect);
adminDoctorRoutes.get('/', doctorController.list);
adminDoctorRoutes.post('/', doctorController.create);
adminDoctorRoutes.get('/:id', doctorController.getById);
adminDoctorRoutes.patch('/:id', doctorController.update);
adminDoctorRoutes.delete('/:id', doctorController.remove);
adminDoctorRoutes.post('/:id/photo', imageUpload(PHOTO_FOLDER), doctorController.uploadPhoto);
adminDoctorRoutes.delete('/:id/photo', doctorController.removePhoto);
