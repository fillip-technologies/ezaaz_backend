import express from 'express';
import cors from 'cors';
import env from './config/env.js';
import routes from './routes/index.js';
import notFound from './shared/middlewares/notFound.js';
import errorHandler from './shared/middlewares/errorHandler.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Uploaded images (doctor photos). Only jpg/png/webp are ever written here.
app.use(
  '/uploads',
  express.static(env.UPLOAD_DIR, {
    maxAge: '7d',
    index: false,
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
  }),
);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
