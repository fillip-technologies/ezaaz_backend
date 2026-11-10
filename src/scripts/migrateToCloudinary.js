import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { PUBLIC_LIST_KEY } from '../modules/doctor/doctor.service.js';
import { PUBLIC_BLOGS_KEY } from '../modules/blog/blog.service.js';
import { PUBLIC_GALLERY_KEY } from '../modules/gallery/gallery.service.js';
import { PUBLIC_SITE_KEY } from '../modules/site/site.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

async function main() {
  console.log('Connecting to MongoDB...');
  await connectDB();
  connectCache();

  if (!isCloudinaryConfigured()) {
    console.error('Cloudinary is not configured in .env!');
    process.exit(1);
  }

  console.log('Scanning uploads directory:', UPLOADS_DIR);
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log('Uploads directory does not exist.');
    await disconnectDB();
    await disconnectCache();
    return;
  }

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

  // 5. Invalidate caches
  console.log('\n--- Invalidating Caches ---');
  await Promise.all([
    cacheDel(PUBLIC_LIST_KEY),
    cacheDel(PUBLIC_BLOGS_KEY),
    cacheDel(PUBLIC_GALLERY_KEY),
    cacheDel(PUBLIC_SITE_KEY),
  ]).catch(() => {});
  console.log('Cache invalidated.');

  // 6. Delete local files from uploads
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
