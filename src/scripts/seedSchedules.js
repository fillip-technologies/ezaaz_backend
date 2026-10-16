// Gives each doctor an online-booking schedule built from their OPD timing text,
// e.g. "10:00 - 16:00 • Mon - Sat" or "14:00 - 18:00 • Tue, Thu, Sat" (15-minute slots, 1 patient each).
// Usage: npm run seed:schedules -> only doctors without a weekly schedule are changed
import { connectDB, disconnectDB } from '../config/database.js';
import { connectCache, cacheDel, disconnectCache } from '../config/cache.js';
import Doctor from '../modules/doctor/doctor.model.js';
import { PUBLIC_LIST_KEY } from '../modules/doctor/doctor.service.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// "Mon - Sat" -> [1..6]; "Tue, Thu, Sat" -> [2, 4, 6]
function parseDays(text) {
  const days = new Set();
  for (const part of text.toLowerCase().split(',')) {
    const [from, to] = part.split(/-|–|to/).map((d) => DAYS.indexOf(d.trim().slice(0, 3)));
    if (from < 0) continue;
    if (to === undefined || to < 0) days.add(from);
    else for (let d = from; d !== (to + 1) % 7; d = (d + 1) % 7) days.add(d);
  }
  return [...days].sort();
}

export function parseTiming(text) {
  const match = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*[•|,]?\s*(.+)/.exec(text || '');
  if (!match) return [];
  const pad = (h, m) => `${h.padStart(2, '0')}:${m}`;
  const start = pad(match[1], match[2]);
  const end = pad(match[3], match[4]);
  return parseDays(match[5]).map((day) => ({ day, start, end }));
}

async function seed() {
  await connectDB();
  connectCache();

  let updated = 0;
  for (const doctor of await Doctor.find()) {
    if (doctor.schedule?.weekly?.length) {
      console.log(`  skip ${doctor.slug} (already has a schedule)`);
      continue;
    }
    const weekly = parseTiming(doctor.timing?.en);
    if (!weekly.length) {
      console.warn(`  ${doctor.slug}: couldn't read timing "${doctor.timing?.en || ''}", left without online booking`);
      continue;
    }
    doctor.schedule = { ...doctor.schedule?.toObject?.(), weekly };
    await doctor.save();
    const days = weekly.map((r) => DAYS[r.day]).join(', ');
    console.log(`  ${doctor.slug}: ${weekly[0].start}-${weekly[0].end} on ${days}`);
    updated++;
  }
  console.log(`Schedules seeded: ${updated} doctors updated`);

  // Give Redis a moment to connect so the cached public doctor list is cleared
  await new Promise((r) => setTimeout(r, 1000));
  await cacheDel(PUBLIC_LIST_KEY);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([disconnectDB(), disconnectCache()]));
