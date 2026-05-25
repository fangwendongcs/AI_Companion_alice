import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import {
  avatarRegistryPath,
  avatarsDir,
  rootDir,
  uploadMaxTotalBytes,
  uploadStorageDir
} from '../config/serverConfig.js';
import { createHttpError } from '../utils/httpError.js';
import { clampNumber } from '../utils/number.js';
import {
  createSafeUploadFilename,
  createUploadError,
  ensureUploadQuotaAvailable,
  UPLOAD_ERROR_CODES,
  writeIsolatedUpload
} from '../utils/uploadStorage.js';
import {
  sanitizeAvatarId,
  sanitizeDisplayName,
  sanitizeIntegrationValue,
  UploadValidationService
} from './UploadValidationService.js';

export class AvatarService {
  constructor({
    validationService = new UploadValidationService()
  } = {}) {
    this.validationService = validationService;
  }

  async getRegistry() {
    const registry = await this.readJsonFile(avatarRegistryPath, { defaultAvatarId: 'alice', avatars: [] });
    return this.hydrateRegistry(registry);
  }

  async createAvatarFromForm(form) {
    const model = form.files.model?.[0];
    if (!model) {
      throw createHttpError('Missing model file. Upload a .vrm, .glb, or .gltf file.', 400);
    }

    const modelExt = this.validationService.getModelExtension(model);
    this.validationService.validateAvatarModelUpload(model, modelExt);

    const avatarId = sanitizeAvatarId(form.fields.avatarId || form.fields.name || model.filename);
    const avatarName = sanitizeDisplayName(form.fields.name || avatarId);
    const targetHeight = clampNumber(form.fields.targetHeight, 40, 260, 120);
    const avatarDir = join(avatarsDir, avatarId);
    const relativeAvatarDir = relative(rootDir, avatarDir);
    if (relativeAvatarDir.startsWith('..') || relativeAvatarDir === '') {
      throw createHttpError('Invalid avatar id.', 400);
    }

    const motionFile = form.files.motions?.[0] || null;
    const skeletonFile = form.files.skeleton?.[0] || null;
    await ensureUploadQuotaAvailable(
      uploadStorageDir,
      totalUploadBytes([model, motionFile, skeletonFile]),
      uploadMaxTotalBytes
    );
    const isolatedModel = await writeIsolatedUpload(model, {
      directory: uploadStorageDir,
      extension: modelExt
    });

    const motions = motionFile
      ? this.validationService.parseJsonUpload(motionFile, 'motions.json')
      : createDefaultMotionManifest();
    const skeletonMap = skeletonFile
      ? this.validationService.parseJsonUpload(skeletonFile, 'skeleton.mixamo.json')
      : createDefaultSkeletonMap();

    await mkdir(avatarDir, { recursive: true });

    const modelFileName = createSafeUploadFilename(modelExt);
    try {
      await writeFile(join(avatarDir, modelFileName), model.buffer);
      await writeFile(join(avatarDir, 'motions.json'), `${JSON.stringify(motions, null, 2)}\n`);
      await writeFile(join(avatarDir, 'skeleton.mixamo.json'), `${JSON.stringify(skeletonMap, null, 2)}\n`);
    } catch {
      throw createUploadError(UPLOAD_ERROR_CODES.STORAGE_FAILED, 'Failed to publish avatar assets.', 500);
    }

    const manifest = createAvatarManifest({
      avatarId,
      avatarName,
      modelFileName,
      isolatedModel,
      targetHeight,
      llmProvider: form.fields.llmProvider,
      llmModel: form.fields.llmModel,
      ttsEngine: form.fields.ttsEngine
    });
    await writeFile(join(avatarDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const registry = await this.upsertRegistry({
      id: avatarId,
      name: avatarName,
      manifest: `public/avatars/${avatarId}/manifest.json`
    });

    return {
      avatar: {
        id: avatarId,
        name: avatarName,
        manifest: `public/avatars/${avatarId}/manifest.json`,
        model: manifest.model,
        motionManifest: manifest.motionManifest,
        skeletonMap: manifest.skeletonMap
      },
      registry
    };
  }

  async upsertRegistry(entry) {
    await mkdir(avatarsDir, { recursive: true });
    const registry = await this.readJsonFile(avatarRegistryPath, {
      defaultAvatarId: entry.id,
      avatars: []
    });

    registry.avatars = Array.isArray(registry.avatars) ? registry.avatars : [];
    const index = registry.avatars.findIndex((avatar) => avatar.id === entry.id);
    if (index >= 0) registry.avatars[index] = entry;
    else registry.avatars.push(entry);
    if (!registry.defaultAvatarId) registry.defaultAvatarId = entry.id;

    await writeFile(avatarRegistryPath, `${JSON.stringify(registry, null, 2)}\n`);
    return registry;
  }

  async readJsonFile(filePath, fallback) {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
      return fallback;
    }
  }

  async hydrateRegistry(registry) {
    const avatars = await Promise.all((registry.avatars || []).map(async (entry) => {
      const configPath = entry.manifest || entry.meta || `public/avatars/${entry.id}/manifest.json`;
      const manifest = await this.readJsonFile(join(rootDir, configPath), null);
      const hydrated = {
        ...entry,
        name: manifest?.name || entry.name || entry.id
      };
      if (entry.manifest) hydrated.manifest = entry.manifest;
      if (entry.meta) hydrated.meta = entry.meta;
      return hydrated;
    }));

    return {
      ...registry,
      avatars
    };
  }
}

function totalUploadBytes(files) {
  return files
    .filter(Boolean)
    .reduce((total, file) => total + (file?.buffer?.length || 0), 0);
}

function createAvatarManifest({
  avatarId,
  avatarName,
  modelFileName,
  isolatedModel,
  targetHeight,
  llmProvider,
  llmModel,
  ttsEngine
}) {
  return {
    id: avatarId,
    name: avatarName,
    type: 'humanoid-gltf',
    model: {
      url: `public/avatars/${avatarId}/${modelFileName}`,
      format: extname(modelFileName).replace('.', '')
    },
    upload: {
      storage: 'isolated',
      originalFilename: isolatedModel?.originalFilename || '',
      storedFilename: isolatedModel?.filename || ''
    },
    thumbnail: '',
    motionManifest: `public/avatars/${avatarId}/motions.json`,
    skeletonMap: `public/avatars/${avatarId}/skeleton.mixamo.json`,
    skeleton: {
      type: 'humanoid',
      map: `public/avatars/${avatarId}/skeleton.mixamo.json`
    },
    animations: {
      manifest: `public/avatars/${avatarId}/motions.json`,
      standardSlots: true
    },
    transform: {
      targetHeight,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1
    },
    camera: {
      targetY: 90,
      minDistance: 100,
      maxDistance: 600
    },
    hitRegions: {
      head: ['head', 'neck'],
      arm: ['arm', 'hand', 'shoulder'],
      leg: ['leg', 'foot', 'toe']
    },
    interactions: {
      head: { motionSlot: 'headTap' },
      leg: { motionSlot: 'legTap' },
      arm: { motionSlot: 'armTap' },
      body: { motionSlot: 'bodyTap' },
      chat: { motionSlot: 'chat' }
    },
    retargeting: {
      adapter: 'mixamoHumanoidMap'
    },
    integrations: {
      llm: {
        provider: sanitizeIntegrationValue(llmProvider || 'openai'),
        model: sanitizeIntegrationValue(llmModel || 'gpt-4o-mini')
      },
      tts: {
        engine: sanitizeIntegrationValue(ttsEngine || 'browser')
      }
    },
    voice: {
      defaultEngine: sanitizeIntegrationValue(ttsEngine || 'browser')
    }
  };
}

function createDefaultMotionManifest() {
  return {
    version: 1,
    slots: {
      intro: {
        file: 'public/models/animations/boot.fbx',
        loop: 'once',
        priority: 20,
        layer: 'gesture',
        interrupt: true,
        fadeIn: 0.2,
        fadeOut: 0.2,
        tags: ['startup']
      },
      idle: {
        file: 'public/models/animations/idle.fbx',
        loop: 'repeat',
        priority: 0,
        layer: 'base',
        interrupt: false,
        fadeIn: 0.35,
        fadeOut: 0.25,
        tags: ['base']
      },
      headTap: createDefaultGestureMotion('public/models/animations/head.fbx', ['interaction', 'head']),
      legTap: createDefaultGestureMotion('public/models/animations/leg.fbx', ['interaction', 'lower_body']),
      armTap: createDefaultGestureMotion('public/models/animations/arm_stretch.fbx', ['interaction', 'upper_body']),
      bodyTap: { fallbackSlot: 'headTap', tags: ['interaction', 'body'] },
      chat: { fallbackSlot: 'armTap', tags: ['interaction', 'chat'] },
      speaking: { fallbackSlot: 'idle', loop: 'repeat', layer: 'base', tags: ['speech'] },
      listening: { fallbackSlot: 'idle', loop: 'repeat', layer: 'base', tags: ['listening'] }
    },
    proceduralFallbacks: {
      idle: true,
      intro: true,
      headTap: true,
      legTap: true,
      armTap: true,
      bodyTap: true,
      chat: true,
      speaking: true,
      listening: true
    }
  };
}

function createDefaultGestureMotion(file, tags) {
  return {
    file,
    loop: 'once',
    priority: 10,
    layer: 'gesture',
    interrupt: true,
    fadeIn: 0.15,
    fadeOut: 0.2,
    tags
  };
}

function createDefaultSkeletonMap() {
  return {};
}
