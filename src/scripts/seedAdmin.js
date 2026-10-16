// Creates the site's single admin from SEED_ADMIN_* in .env. Usage: npm run seed:admin
import { connectDB, disconnectDB } from '../config/database.js';
import Admin from '../modules/admin/admin.model.js';

const { SEED_ADMIN_NAME = 'Admin', SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;

async function seed() {
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env');
  }

  await connectDB();

  const existing = await Admin.findOne();
  if (existing) {
    console.log(`An admin already exists (${existing.email}), nothing to do.`);
    return;
  }

  const admin = await Admin.create({
    name: SEED_ADMIN_NAME,
    email: SEED_ADMIN_EMAIL,
    password: SEED_ADMIN_PASSWORD,
  });
  console.log(`Admin created: ${admin.email}`);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
