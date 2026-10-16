// Pure slot maths: no database access. Dates are clinic-local 'YYYY-MM-DD', times 'HH:mm'.
import { toMinutes } from '../doctor/doctor.model.js';

export const CLINIC_TIME_ZONE = 'Asia/Kolkata';

const pad = (n) => String(n).padStart(2, '0');
export const fromMinutes = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// Current clinic date and minute of the day
export function clinicNow(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: CLINIC_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Calendar maths on date strings (UTC midnight, so no DST or zone surprises)
const toDate = (date) => new Date(`${date}T00:00:00Z`);
export const isRealDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && toDate(date).toISOString().startsWith(date);
export const weekday = (date) => toDate(date).getUTCDay();
export const daysBetween = (from, to) => Math.round((toDate(to) - toDate(from)) / 86400000);
export function addDays(date, n) {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Every slot start time from the doctor's weekly hours for that weekday
export function scheduledTimes(schedule, date) {
  const step = schedule?.slotMinutes || 15;
  const times = [];
  for (const range of schedule?.weekly || []) {
    if (range.day !== weekday(date)) continue;
    for (let m = toMinutes(range.start); m + step <= toMinutes(range.end); m += step) times.push(m);
  }
  return [...new Set(times)].sort((a, b) => a - b).map(fromMinutes);
}

// Leave entries that apply on `date` (already filtered to this doctor + hospital-wide)
function blockedBy(leaves, date, time) {
  const m = toMinutes(time);
  return leaves.some(
    (l) => l.date === date && (!l.from || (m >= toMinutes(l.from) && m < toMinutes(l.to))),
  );
}

/**
 * Slots for one doctor on one date.
 * Returns { status, slots: [{ time, remaining }] } where status is
 * 'available' | 'full' (every slot booked) | 'closed' (no OPD / outside window / all passed) | 'leave'.
 * `booked` maps 'HH:mm' -> number of active bookings. `admin: true` ignores the booking window and notice.
 */
export function daySlots({ schedule, date, leaves = [], booked = new Map(), now = clinicNow(), admin = false }) {
  const offset = daysBetween(now.date, date);
  if (offset < 0) return { status: 'closed', slots: [] };
  if (!admin && offset >= (schedule?.bookingWindowDays || 30)) return { status: 'closed', slots: [] };

  const all = scheduledTimes(schedule, date);
  if (!all.length) return { status: 'closed', slots: [] };

  const open = all.filter((t) => !blockedBy(leaves, date, t));
  if (!open.length) return { status: 'leave', slots: [] };

  const notice = admin ? 0 : schedule?.minNoticeMinutes ?? 60;
  const upcoming = open.filter((t) => offset * 1440 + toMinutes(t) - now.minutes >= Math.max(notice, 1));
  if (!upcoming.length) return { status: 'closed', slots: [] };

  const capacity = schedule?.capacity || 1;
  const slots = upcoming.map((time) => ({ time, remaining: Math.max(0, capacity - (booked.get(time) || 0)) }));
  return { status: slots.some((s) => s.remaining > 0) ? 'available' : 'full', slots };
}

// Comparable form of a schedule (defaults filled in, ranges sorted) — used to tell whether a doctor
// still matches their slot plan or has been customized
export function normalizeSchedule(s = {}) {
  return {
    slotMinutes: Number(s.slotMinutes ?? 15),
    capacity: Number(s.capacity ?? 1),
    bookingWindowDays: Number(s.bookingWindowDays ?? 30),
    minNoticeMinutes: Number(s.minNoticeMinutes ?? 60),
    weekly: [...(s.weekly || [])]
      .map((r) => ({ day: Number(r.day), start: r.start, end: r.end }))
      .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
  };
}

export const sameSchedule = (a, b) => JSON.stringify(normalizeSchedule(a)) === JSON.stringify(normalizeSchedule(b));
