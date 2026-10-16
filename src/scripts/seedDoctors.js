// Imports the hospital's existing doctors (scripts/data/doctors.json + photos) into MongoDB.
// Usage: npm run seed:doctors            -> adds doctors whose slug isn't in the DB yet
//        npm run seed:doctors -- --fresh -> deletes ALL doctors (and their photos) first
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB, disconnectDB } from '../config/database.js';
import { connectCache, cacheDel, disconnectCache } from '../config/cache.js';
import Doctor from '../modules/doctor/doctor.model.js';
import { PHOTO_FOLDER, PUBLIC_LIST_KEY } from '../modules/doctor/doctor.service.js';
import { publicFileUrl, removeStoredFile, uploadDir } from '../shared/middlewares/upload.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const fresh = process.argv.includes('--fresh');

function copyPhoto(photoFile) {
  if (!photoFile) return '';
  const source = path.join(DATA_DIR, 'doctor-photos', photoFile);
  if (!fs.existsSync(source)) {
    console.warn(`  photo not found: ${photoFile}`);
    return '';
  }
  const dir = uploadDir(PHOTO_FOLDER);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}${path.extname(photoFile).toLowerCase()}`;
  fs.copyFileSync(source, path.join(dir, filename));
  return publicFileUrl(PHOTO_FOLDER, filename);
}

async function seed() {
  const doctors = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'doctors.json'), 'utf8'));
  await connectDB();
  connectCache();

  if (fresh) {
    const existing = await Doctor.find().select('photo').lean();
    await Promise.all(existing.map((d) => removeStoredFile(PHOTO_FOLDER, d.photo)));
    const { deletedCount } = await Doctor.deleteMany({});
    console.log(`Removed ${deletedCount} existing doctors`);
  }

  let created = 0;
  for (const { photoFile, ...data } of doctors) {
    if (await Doctor.exists({ slug: data.slug })) {
      console.log(`  skip ${data.slug} (already exists)`);
      continue;
    }
    await Doctor.create({ ...data, photo: copyPhoto(photoFile) });
    console.log(`  added ${data.slug}${data.isActive ? '' : ' (hidden)'}`);
    created++;
  }
  console.log(`Doctors seeded: ${created} added, ${doctors.length - created} skipped`);

  // Give Redis a moment to connect so the stale public list is cleared
  await new Promise((r) => setTimeout(r, 1000));
  await cacheDel(PUBLIC_LIST_KEY);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([disconnectDB(), disconnectCache()]));
