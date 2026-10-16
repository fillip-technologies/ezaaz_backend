import mongoose from 'mongoose';
import env from './env.js';

mongoose.set('strictQuery', true);

mongoose.connection.on('connected', () => {
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

export async function connectDB() {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.connection.close();
}

const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export function getDBStatus() {
  return STATES[mongoose.connection.readyState] ?? 'unknown';
}
