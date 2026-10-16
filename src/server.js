import env from './config/env.js';
import { connectDB, disconnectDB } from './config/database.js';
import { connectCache, disconnectCache } from './config/cache.js';
import { verifyMailer } from './config/mailer.js';
import app from './app.js';

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error(`Failed to connect to MongoDB: ${err.message}`);
    process.exit(1);
  }

  connectCache();
  verifyMailer();

  // Express 5 passes listen errors (e.g. port already in use) to this callback
  const server = app.listen(env.PORT, (err) => {
    if (err) {
      console.error(
        err.code === 'EADDRINUSE'
          ? `Port ${env.PORT} is already in use. Stop the other server or set a different PORT.`
          : `Failed to start server: ${err.message}`,
      );
      process.exit(1);
    }
    console.log(`Server running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await Promise.all([disconnectDB(), disconnectCache()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start();
