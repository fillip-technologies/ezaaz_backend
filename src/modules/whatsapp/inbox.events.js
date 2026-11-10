// Live updates for the admin WhatsApp inbox (server-sent events). One server process, so an in-memory list
// of open streams is enough; with several processes this would need Redis pub/sub.

const clients = new Set();
const HEARTBEAT_MS = 25000;

export function openStream(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stop nginx buffering the stream
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  clients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

// event: 'message' (new or updated message) | 'conversation' (list row changed)
export function publish(event, data) {
  if (!clients.size) return;
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(chunk);
}
