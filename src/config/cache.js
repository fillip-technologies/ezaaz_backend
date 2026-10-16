import { createClient } from 'redis';
import env from './env.js';

// Read-through cache on top of MongoDB. Every function here is safe to call when Redis
// is not configured or is down: reads return null (caller falls back to the DB), writes no-op.

let client = null;
const k = (key) => `${env.REDIS_KEY_PREFIX}${key}`;
let lastState = '';

function logState(state, detail = '') {
  if (state === lastState) return;
  lastState = state;
  const log = state === 'ready' ? console.log : console.warn;
  log(`Redis ${state}${detail ? `: ${detail}` : ''}`);
}

export function connectCache() {
  if (!env.REDIS_URL) {
    console.warn('REDIS_URL not set: caching disabled, reading from MongoDB only.');
    return;
  }

  client = createClient({
    url: env.REDIS_URL,
    disableOfflineQueue: true, // fail fast instead of queueing while disconnected
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => Math.min(retries * 500, 10000),
    },
  });

  client.on('ready', () => logState('ready'));
  client.on('error', (err) => logState('unavailable', err.code || err.message));

  // Not awaited: the API starts even if Redis is unreachable and keeps retrying in the background
  client.connect().catch((err) => logState('unavailable', err.message));
}

export async function disconnectCache() {
  if (client?.isOpen) await client.quit().catch(() => {});
}

export function cacheStatus() {
  if (!env.REDIS_URL) return 'disabled';
  return client?.isReady ? 'connected' : 'unavailable';
}

export async function cacheGet(key) {
  if (!client?.isReady) return null;
  try {
    const raw = await client.get(k(key));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn(`Cache read failed for ${key}: ${err.message}`);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = env.CACHE_TTL_SECONDS) {
  if (!client?.isReady) return;
  try {
    await client.set(k(key), JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    console.warn(`Cache write failed for ${key}: ${err.message}`);
  }
}

export async function cacheDel(...keys) {
  if (!client?.isReady || !keys.length) return;
  try {
    await client.del(keys.map(k));
  } catch (err) {
    console.warn(`Cache delete failed for ${keys.join(', ')}: ${err.message}`);
  }
}
