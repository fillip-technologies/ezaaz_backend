import mongoose from 'mongoose';
import SlotPlan from './slotPlan.model.js';
import Appointment from './appointment.model.js';
import Doctor from '../doctor/doctor.model.js';
import { PUBLIC_LIST_KEY } from '../doctor/doctor.service.js';
import ApiError from '../../shared/utils/ApiError.js';
import { cacheDel } from '../../config/cache.js';
import { clinicNow, scheduledTimes } from './slots.js';

const PLAN_FIELDS = ['name', 'description', 'schedule'];

function pick(body) {
  const data = {};
  for (const key of PLAN_FIELDS) if (body[key] !== undefined) data[key] = body[key];
  return data;
}

const isObjectId = (v) => mongoose.isValidObjectId(v) && String(new mongoose.Types.ObjectId(String(v))) === String(v);
const plainSchedule = (plan) => plan.schedule.toObject?.() ?? plan.schedule;

async function getPlan(id) {
  const plan = isObjectId(id) && (await SlotPlan.findById(id));
  if (!plan) throw ApiError.notFound('Slot plan not found');
  return plan;
}

// Upcoming bookings of these doctors whose time isn't in `schedule` any more (they keep their seat,
// but the admin should move them)
async function bookingsOutside(doctorIds, schedule) {
  if (!doctorIds.length) return 0;
  const upcoming = await Appointment.find({ doctor: { $in: doctorIds }, active: true, date: { $gte: clinicNow().date } })
    .select('date time')
    .lean();
  return upcoming.filter((a) => !scheduledTimes(schedule, a.date).includes(a.time)).length;
}

export async function listPlans() {
  const [plans, usage] = await Promise.all([
    SlotPlan.find().sort({ name: 1 }).lean(),
    Doctor.aggregate([
      { $match: { schedulePlan: { $ne: null } } },
      { $group: { _id: '$schedulePlan', following: { $sum: { $cond: ['$scheduleCustomized', 0, 1] } }, customized: { $sum: { $cond: ['$scheduleCustomized', 1, 0] } } } },
    ]),
  ]);
  const byId = new Map(usage.map((u) => [String(u._id), u]));
  return plans.map(({ __v, ...plan }) => ({
    ...plan,
    followingCount: byId.get(String(plan._id))?.following || 0,
    customizedCount: byId.get(String(plan._id))?.customized || 0,
  }));
}

export async function getPlanById(id) {
  return getPlan(id);
}

export function createPlan(body) {
  return SlotPlan.create(pick(body));
}

// Editing a plan updates every doctor still following it; customized doctors keep their own hours
export async function updatePlan(id, body) {
  const plan = await getPlan(id);
  plan.set(pick(body));
  await plan.save();

  const followers = await Doctor.find({ schedulePlan: plan._id, scheduleCustomized: false }).select('_id').lean();
  const ids = followers.map((d) => d._id);
  if (ids.length) {
    await Doctor.updateMany({ _id: { $in: ids } }, { $set: { schedule: plainSchedule(plan) } });
    await cacheDel(PUBLIC_LIST_KEY);
  }
  const customized = await Doctor.countDocuments({ schedulePlan: plan._id, scheduleCustomized: true });
  return {
    plan,
    doctorsUpdated: ids.length,
    customizedSkipped: customized,
    bookingsOutsideHours: await bookingsOutside(ids, plainSchedule(plan)),
  };
}

// Doctors keep their current hours; they just stop being linked to the plan
export async function deletePlan(id) {
  const plan = await getPlan(id);
  const { modifiedCount } = await Doctor.updateMany(
    { schedulePlan: plan._id },
    { $set: { schedulePlan: null, scheduleCustomized: false } },
  );
  await plan.deleteOne();
  return { doctorsUnlinked: modifiedCount };
}

// Copies the plan's hours to every chosen doctor (replacing their current hours) and links them to it
export async function assignPlan(id, body) {
  const plan = await getPlan(id);
  const doctorIds = [...new Set((Array.isArray(body.doctors) ? body.doctors : []).map(String))];
  if (!doctorIds.length) throw new ApiError(400, 'Validation failed', [{ field: 'doctors', message: 'Choose at least one doctor' }]);
  if (!doctorIds.every(isObjectId)) throw new ApiError(400, 'Validation failed', [{ field: 'doctors', message: 'Choose valid doctors' }]);

  if ((await Doctor.countDocuments({ _id: { $in: doctorIds } })) !== doctorIds.length) {
    throw new ApiError(400, 'Validation failed', [{ field: 'doctors', message: 'Some doctors were not found' }]);
  }

  const { matchedCount } = await Doctor.updateMany(
    { _id: { $in: doctorIds } },
    { $set: { schedule: plainSchedule(plan), schedulePlan: plan._id, scheduleCustomized: false } },
  );
  await cacheDel(PUBLIC_LIST_KEY);
  return { assigned: matchedCount, bookingsOutsideHours: await bookingsOutside(doctorIds, plainSchedule(plan)) };
}
