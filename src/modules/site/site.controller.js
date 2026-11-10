import * as siteService from './site.service.js';

export async function getPublic(req, res) {
  const { data, source } = await siteService.getPublicSettings();
  res.set('X-Cache', source === 'cache' ? 'HIT' : 'MISS');
  res.json({ success: true, data });
}

export async function get(req, res) {
  res.json({ success: true, data: await siteService.getAdminSettings() });
}

export async function uploadVideo(req, res) {
  res.json({ success: true, data: await siteService.setVideo(req.params.key, req.file) });
}

export async function resetVideo(req, res) {
  res.json({ success: true, data: await siteService.resetVideo(req.params.key) });
}

export async function updateHeroStats(req, res) {
  res.json({ success: true, data: await siteService.updateHeroStats(req.body ?? {}) });
}
