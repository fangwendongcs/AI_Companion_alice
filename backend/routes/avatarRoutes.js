import { maxUploadBodyBytes } from '../config/serverConfig.js';
import { AvatarService } from '../services/AvatarService.js';
import { readMultipartForm } from '../utils/request.js';
import { sendJson } from '../utils/response.js';

const avatarService = new AvatarService();

export async function handleAvatarRegistry(_req, res) {
  const registry = await avatarService.getRegistry();
  sendJson(res, 200, registry);
}

export async function handleAvatarUpload(req, res) {
  const form = await readMultipartForm(req, maxUploadBodyBytes);
  const payload = await avatarService.createAvatarFromForm(form);
  sendJson(res, 201, payload);
}
