import { Router } from 'express';
import * as whatsappController from './whatsapp.controller.js';
import { protect } from '../../shared/middlewares/auth.js';
import { privateDocumentUpload } from '../../shared/middlewares/upload.js';
import { MEDIA_FOLDER } from './whatsapp.service.js';

// Meta's webhook: GET verifies the callback URL, POST delivers messages and receipts (signature checked)
export const whatsappWebhookRoutes = Router();
whatsappWebhookRoutes.get('/', whatsappController.verifyWebhook);
whatsappWebhookRoutes.post('/', whatsappController.receiveWebhook);

// Admin panel: WhatsApp inbox
export const adminInboxRoutes = Router();
adminInboxRoutes.use(protect);
adminInboxRoutes.get('/summary', whatsappController.summary);
adminInboxRoutes.get('/stream', whatsappController.stream);
adminInboxRoutes.get('/templates', whatsappController.listTemplates);
adminInboxRoutes.get('/conversations', whatsappController.listConversations);
adminInboxRoutes.post('/conversations', whatsappController.startConversation);
adminInboxRoutes.get('/conversations/:id', whatsappController.getConversation);
adminInboxRoutes.patch('/conversations/:id', whatsappController.updateConversation);
adminInboxRoutes.get('/conversations/:id/messages', whatsappController.listMessages);
adminInboxRoutes.post('/conversations/:id/messages', whatsappController.sendMessage);
adminInboxRoutes.post('/conversations/:id/files', privateDocumentUpload(MEDIA_FOLDER), whatsappController.sendFile);
adminInboxRoutes.get('/media/:messageId', whatsappController.messageFile);
