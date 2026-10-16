import mongoose from 'mongoose';
import Department from './department.model.js';
import Enquiry from './enquiry.model.js';
import Doctor from '../doctor/doctor.model.js';
import ApiError from '../../shared/utils/ApiError.js';
import { slugify, uniqueSlug } from '../../shared/utils/schemas.js';

const DEPARTMENT_FIELDS = ['slug', 'name', 'order', 'isActive'];
const ENQUIRY_FIELDS = ['fullName', 'phone', 'email', 'preferredDate', 'department', 'doctor', 'message', 'source', 'page'];
const ENQUIRY_ADMIN_FIELDS = ['status', 'adminNote'];

function pick(body, fields) {
  const data = {};
  for (const key of fields) if (body[key] !== undefined) data[key] = body[key];
  return data;
}

const isObjectId = (v) => mongoose.isValidObjectId(v) && String(new mongoose.Types.ObjectId(String(v))) === String(v);
const invalid = (field, message) => new ApiError(400, 'Validation failed', [{ field, message }]);

/* ----------------------------- Public (website) ----------------------------- */

export function listPublicDepartments() {
  return Department.find({ isActive: true }).select('slug name').sort({ order: 1, createdAt: 1 }).lean();
}

export async function createEnquiry(body) {
  const data = pick(body, ENQUIRY_FIELDS);
  for (const key of ['fullName', 'phone', 'email', 'message', 'source', 'page']) {
    if (data[key] !== undefined) data[key] = String(data[key]);
  }

  // Department must be an active one; "any doctor" is sent as empty
  if (data.department) {
    const department = isObjectId(data.department) && (await Department.findOne({ _id: data.department, isActive: true }).lean());
    if (!department) throw invalid('department', 'Choose a valid department');
    data.departmentName = department.name.en;
  } else {
    data.department = null;
  }

  if (data.doctor) {
    const doctor = isObjectId(data.doctor) && (await Doctor.findOne({ _id: data.doctor, isActive: true }).select('name').lean());
    if (!doctor) throw invalid('doctor', 'Choose a valid doctor');
    data.doctorName = doctor.name.en;
  } else {
    data.doctor = null;
  }

  if (data.preferredDate) {
    const date = new Date(data.preferredDate);
    if (Number.isNaN(date.getTime())) throw invalid('preferredDate', 'Choose a valid date');
    data.preferredDate = date;
  } else {
    data.preferredDate = null;
  }

  const enquiry = await Enquiry.create(data);
  return { _id: enquiry._id, createdAt: enquiry.createdAt };
}

/* --------------------------- Admin: departments --------------------------- */

export async function listDepartmentsWithCounts() {
  const [departments, counts] = await Promise.all([
    Department.find().sort({ order: 1, createdAt: 1 }).lean(),
    Enquiry.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  return departments.map(({ __v, ...d }) => ({ ...d, enquiryCount: countById.get(String(d._id)) || 0 }));
}

export async function createDepartment(body) {
  const data = pick(body, DEPARTMENT_FIELDS);
  data.slug = data.slug ? slugify(data.slug) : await uniqueSlug(Department, slugify(data.name?.en) || 'department');
  if (data.order === undefined) {
    const last = await Department.findOne().sort({ order: -1 }).select('order').lean();
    data.order = (last?.order ?? 0) + 1;
  }
  return Department.create(data);
}

export async function updateDepartment(id, body) {
  const department = await Department.findById(id);
  if (!department) throw ApiError.notFound('Department not found');
  const data = pick(body, DEPARTMENT_FIELDS);
  if (data.slug !== undefined) data.slug = slugify(data.slug) || department.slug;
  department.set(data);
  await department.save();
  return department;
}

// Past enquiries keep the department's name, so deleting is always allowed
export async function deleteDepartment(id) {
  const department = await Department.findById(id);
  if (!department) throw ApiError.notFound('Department not found');
  await department.deleteOne();
}

/* ---------------------------- Admin: enquiries ---------------------------- */

export async function listEnquiries() {
  return Enquiry.find().sort({ createdAt: -1 }).lean();
}

export async function updateEnquiry(id, body) {
  const enquiry = await Enquiry.findById(id);
  if (!enquiry) throw ApiError.notFound('Enquiry not found');
  enquiry.set(pick(body, ENQUIRY_ADMIN_FIELDS));
  await enquiry.save();
  return enquiry;
}

export async function deleteEnquiry(id) {
  const enquiry = await Enquiry.findById(id);
  if (!enquiry) throw ApiError.notFound('Enquiry not found');
  await enquiry.deleteOne();
}
