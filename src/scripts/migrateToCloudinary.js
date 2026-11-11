import fs from 'node:fs';
import path from 'node:path';
import { connectDB, disconnectDB } from '../config/database.js';
import { connectCache, cacheDel, disconnectCache } from '../config/cache.js';
import env from '../config/env.js';
import {
  isCloudinaryConfigured,
  uploadToCloudinary,
} from '../config/cloudinary.js';
import Doctor from '../modules/doctor/doctor.model.js';
import Blog from '../modules/blog/blog.model.js';
import GalleryItem from '../modules/gallery/gallery.model.js';
import SiteSetting from '../modules/site/site.model.js';
import Report, { REPORT_FOLDER } from '../modules/patient/report.model.js';
import Message from '../modules/whatsapp/message.model.js';
import { MEDIA_FOLDER } from '../modules/whatsapp/whatsapp.service.js';
import { isCloudinaryFile, privateFilePath, readPrivateFile, savePrivateFile } from '../shared/middlewares/upload.js';
import { PUBLIC_LIST_KEY } from '../modules/doctor/doctor.service.js';
import { PUBLIC_BLOGS_KEY } from '../modules/blog/blog.service.js';
import { PUBLIC_GALLERY_KEY } from '../modules/gallery/gallery.service.js';
import { PUBLIC_SITE_KEY } from '../modules/site/site.service.js';

const UPLOADS_DIR = env.UPLOAD_DIR;
const notOnCloudinary = { $exists: true, $nin: ['', null], $not: /^cloudinary:/ };

// Copies one private file from PRIVATE_UPLOAD_DIR to Cloudinary (authenticated). Returns the new stored name, or null.
// The local copy is only deleted (step 7) once the database points at the new name.
async function copyPrivateFile(folder, storedName, mime) {
  const buffer = await readPrivateFile(folder, storedName);
  if (!buffer) {
    console.warn(`  ${folder}/${storedName} is missing on disk, skipped`);
    return null;
  }
  return savePrivateFile(folder, buffer, mime);
}

async function main() {
  console.log('Connecting to MongoDB...');
  await connectDB();
  connectCache();

  if (!isCloudinaryConfigured()) {
    console.error('Cloudinary is not configured in .env!');
    process.exit(1);
  }

  console.log('Scanning uploads directory:', UPLOADS_DIR);
  if (!fs.existsSync(UPLOADS_DIR)) console.log('Uploads directory does not exist: no public files to move.');

  // Map of local path relative to uploads, e.g. "/uploads/doctors/xyz.jpg" -> Cloudinary URL
  const urlMapping = new Map();
  const subdirs = ['doctors', 'blogs', 'gallery', 'site'];
  const uploadedLocalFiles = [];

  for (const sub of subdirs) {
    const dir = path.join(UPLOADS_DIR, sub);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
    console.log(`Found ${files.length} files in uploads/${sub}`);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const ext = path.extname(file).toLowerCase();
      const isVideo = ext === '.mp4' || ext === '.webm';
      const localRelUrl = `/uploads/${sub}/${file}`;

      console.log(`Uploading ${localRelUrl} to Cloudinary...`);
      try {
        const result = await uploadToCloudinary(fullPath, {
          folder: sub,
          resourceType: isVideo ? 'video' : 'image',
        });
        console.log(` -> Uploaded: ${result.url}`);
        urlMapping.set(localRelUrl, result.url);
        urlMapping.set(file, result.url); // also map by filename
        uploadedLocalFiles.push(fullPath);
      } catch (err) {
        console.error(`Failed to upload ${file}:`, err.message);
      }
    }
  }

  console.log('\n--- Updating Database Records ---');

  // 1. Doctors
  const doctors = await Doctor.find({});
  let doctorsUpdated = 0;
  for (const doc of doctors) {
    if (doc.photo && !doc.photo.startsWith('http')) {
      const newUrl = urlMapping.get(doc.photo) || urlMapping.get(path.basename(doc.photo));
      if (newUrl) {
        console.log(`Doctor "${doc.name}": ${doc.photo} -> ${newUrl}`);
        doc.photo = newUrl;
        await doc.save();
        doctorsUpdated++;
      } else {
        console.warn(`Doctor "${doc.name}" has photo "${doc.photo}" but no uploaded match found!`);
      }
    }
  }
  console.log(`Updated ${doctorsUpdated} doctor records.`);

  // 2. Blogs
  const blogs = await Blog.find({});
  let blogsUpdated = 0;
  for (const blog of blogs) {
    if (blog.coverImage && !blog.coverImage.startsWith('http')) {
      const newUrl = urlMapping.get(blog.coverImage) || urlMapping.get(path.basename(blog.coverImage));
      if (newUrl) {
        console.log(`Blog "${blog.title}": ${blog.coverImage} -> ${newUrl}`);
        blog.coverImage = newUrl;
        await blog.save();
        blogsUpdated++;
      } else {
        console.warn(`Blog "${blog.title}" has cover "${blog.coverImage}" but no uploaded match found!`);
      }
    }
  }
  console.log(`Updated ${blogsUpdated} blog records.`);

  // 3. Gallery Items
  const galleryItems = await GalleryItem.find({});
  let galleryUpdated = 0;
  for (const item of galleryItems) {
    let changed = false;
    if (item.image && !item.image.startsWith('http')) {
      const newUrl = urlMapping.get(item.image) || urlMapping.get(path.basename(item.image));
      if (newUrl) {
        item.image = newUrl;
        changed = true;
      }
    }
    if (item.videoFile && !item.videoFile.startsWith('http')) {
      const newUrl = urlMapping.get(item.videoFile) || urlMapping.get(path.basename(item.videoFile));
      if (newUrl) {
        item.videoFile = newUrl;
        changed = true;
      }
    }
    if (changed) {
      await item.save();
      galleryUpdated++;
    }
  }
  console.log(`Updated ${galleryUpdated} gallery records.`);

  // 4. Site Settings
  const settings = await SiteSetting.findOne();
  if (settings) {
    let changed = false;
    if (settings.introVideo && !settings.introVideo.startsWith('http')) {
      const newUrl = urlMapping.get(settings.introVideo) || urlMapping.get(path.basename(settings.introVideo));
      if (newUrl) {
        settings.introVideo = newUrl;
        changed = true;
      }
    }
    if (settings.heroVideo && !settings.heroVideo.startsWith('http')) {
      const newUrl = urlMapping.get(settings.heroVideo) || urlMapping.get(path.basename(settings.heroVideo));
      if (newUrl) {
        settings.heroVideo = newUrl;
        changed = true;
      }
    }
    if (changed) {
      await settings.save();
      console.log('Updated site settings videos.');
    }
  }

  // 5. Private files: patient reports and WhatsApp media (PRIVATE_UPLOAD_DIR -> Cloudinary, authenticated)
  console.log('\n--- Moving Private Files (reports, WhatsApp media) ---');
  const reports = await Report.find({ 'file.storedName': notOnCloudinary }).lean();
  let reportsMoved = 0;
  for (const report of reports) {
    try {
      const oldName = report.file.storedName;
      const newName = await copyPrivateFile(REPORT_FOLDER, oldName, report.file.mime);
      if (!newName) continue;
      await Report.updateOne({ _id: report._id }, { $set: { 'file.storedName': newName } });
      // Messages that sent this report point at the same file
      await Message.updateMany({ 'media.folder': REPORT_FOLDER, 'media.storedName': oldName }, { $set: { 'media.storedName': newName } });
      uploadedLocalFiles.push(privateFilePath(REPORT_FOLDER, oldName));
      reportsMoved++;
    } catch (err) {
      console.error(`Failed to move report ${report._id}:`, err.message);
    }
  }
  console.log(`Moved ${reportsMoved} of ${reports.length} reports.`);

  const messages = await Message.find({ 'media.storedName': notOnCloudinary, 'media.folder': { $ne: REPORT_FOLDER } }).lean();
  let mediaMoved = 0;
  for (const message of messages) {
    if (isCloudinaryFile(message.media.storedName)) continue;
    try {
      const folder = message.media.folder || MEDIA_FOLDER;
      const newName = await copyPrivateFile(folder, message.media.storedName, message.media.mime);
      if (!newName) continue;
      await Message.updateOne({ _id: message._id }, { $set: { 'media.storedName': newName, 'media.folder': folder } });
      uploadedLocalFiles.push(privateFilePath(folder, message.media.storedName));
      mediaMoved++;
    } catch (err) {
      console.error(`Failed to move WhatsApp file of message ${message._id}:`, err.message);
    }
  }
  console.log(`Moved ${mediaMoved} of ${messages.length} WhatsApp files.`);

  // 6. Invalidate caches
  console.log('\n--- Invalidating Caches ---');
  await Promise.all([
    cacheDel(PUBLIC_LIST_KEY),
    cacheDel(PUBLIC_BLOGS_KEY),
    cacheDel(PUBLIC_GALLERY_KEY),
    cacheDel(PUBLIC_SITE_KEY),
  ]).catch(() => {});
  console.log('Cache invalidated.');

  // 7. Delete local files that are now on Cloudinary
  console.log('\n--- Removing Local Temporary Files ---');
  let removedCount = 0;
  for (const filePath of uploadedLocalFiles) {
    try {
      fs.unlinkSync(filePath);
      removedCount++;
    } catch (err) {
      console.warn(`Could not remove ${filePath}:`, err.message);
    }
  }
  console.log(`Successfully removed ${removedCount} local files.`);

  console.log('\nMigration to Cloudinary completed successfully!');
  await disconnectDB();
  await disconnectCache();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
