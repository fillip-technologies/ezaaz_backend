// Creates patient records for bookings made before patient records existed, and links each booking to its
// patient (same number + same name = same patient). Safe to run again. Usage: npm run backfill:patients
import { connectDB, disconnectDB } from '../config/database.js';
import Appointment from '../modules/appointment/appointment.model.js';
import { findOrCreateForBooking } from '../modules/patient/patient.service.js';

async function run() {
  await connectDB();
  // Oldest first, so each patient's details end up as they entered them most recently
  const cursor = Appointment.find({ patient: null }).sort({ createdAt: 1 }).cursor();
  let linked = 0;
  let failed = 0;
  const patients = new Set();
  for await (const appointment of cursor) {
    try {
      const patient = await findOrCreateForBooking(appointment);
      await Appointment.updateOne({ _id: appointment._id }, { patient: patient._id });
      patients.add(String(patient._id));
      linked++;
    } catch (err) {
      failed++;
      console.error(`${appointment.ref}: ${err.message}`);
    }
  }
  console.log(`Linked ${linked} booking(s) to ${patients.size} patient(s).${failed ? ` ${failed} failed (see above).` : ''}`);
}

run()
  .catch((err) => {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
