import { Router } from 'express';
import * as patientController from './patient.controller.js';
import { protect } from '../../shared/middlewares/auth.js';
import { privateDocumentUpload } from '../../shared/middlewares/upload.js';
import { REPORT_FOLDER } from './report.model.js';

// Admin panel: patient records
export const adminPatientRoutes = Router();
adminPatientRoutes.use(protect);
adminPatientRoutes.get('/', patientController.list);
adminPatientRoutes.post('/', patientController.create);
adminPatientRoutes.get('/:id', patientController.get);
adminPatientRoutes.patch('/:id', patientController.update);
adminPatientRoutes.post('/:id/visits', patientController.createVisit);
adminPatientRoutes.post('/:id/reports', privateDocumentUpload(REPORT_FOLDER), patientController.createReport);

export const adminVisitRoutes = Router();
adminVisitRoutes.use(protect);
adminVisitRoutes.patch('/:id', patientController.updateVisit);
adminVisitRoutes.delete('/:id', patientController.removeVisit);

// Report files are private: only reachable here, signed in
export const adminReportRoutes = Router();
adminReportRoutes.use(protect);
adminReportRoutes.get('/:id/file', patientController.reportFile);
adminReportRoutes.patch('/:id', patientController.updateReport);
adminReportRoutes.delete('/:id', patientController.removeReport);
adminReportRoutes.post('/:id/send-whatsapp', patientController.sendReportOnWhatsApp);
