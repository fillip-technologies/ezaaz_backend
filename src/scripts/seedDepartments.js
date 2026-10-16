// Imports the contact form's departments (scripts/data/departments.json).
// Usage: npm run seed:departments -> adds departments whose slug isn't in the DB yet
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB, disconnectDB } from '../config/database.js';
import Department from '../modules/contact/department.model.js';

const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'departments.json');

async function seed() {
  const departments = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  await connectDB();

  let created = 0;
  for (const [index, data] of departments.entries()) {
    if (await Department.exists({ slug: data.slug })) {
      console.log(`  skip ${data.slug} (already exists)`);
      continue;
    }
    await Department.create({ order: index + 1, ...data });
    console.log(`  added ${data.slug}`);
    created++;
  }
  console.log(`Departments seeded: ${created} added, ${departments.length - created} skipped`);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
