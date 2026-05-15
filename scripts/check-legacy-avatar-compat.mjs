import { readFile } from 'node:fs/promises';
import { AvatarManifestLoader } from '../js/avatar/AvatarManifestLoader.js';
import {
  summarizeAvatarRegistryCompatibility,
  validateAvatarManifest,
  validateAvatarRegistry
} from '../js/config/validateConfig.js';

const fixtureRoot = 'tests/fixtures/avatars/legacy-meta-only';
const registry = await readJson(`${fixtureRoot}/registry.json`);
const entry = registry.avatars?.[0];
const requestedPaths = [];
const loader = new AvatarManifestLoader({
  loadJsonFn: async (path) => {
    const normalized = stripQuery(path);
    requestedPaths.push(normalized);
    return readJson(normalized);
  }
});

const result = await loader.load(entry.id, entry);
const registryValidation = validateAvatarRegistry(registry);
const manifestValidation = validateAvatarManifest(result.manifest);
const compatibility = summarizeAvatarRegistryCompatibility(registry);
const dualTrackValidation = validateAvatarRegistry({
  defaultAvatarId: 'dual_track_fixture',
  avatars: [
    {
      id: 'dual_track_fixture',
      manifest: 'public/avatars/dual_track_fixture/manifest.json',
      meta: 'public/avatars/dual_track_fixture/meta.json'
    }
  ]
});

assert(registryValidation.ok, 'expected legacy meta-only registry to remain valid during support window');
assert(result.source === 'legacy-meta', 'expected legacy-meta fallback source');
assert(result.path === `${fixtureRoot}/meta.json`, 'expected fallback to fixture meta.json');
assert(result.manifest.id === entry.id, 'expected fallback manifest id to match entry id');
assert(manifestValidation.ok, 'expected fallback manifest payload to satisfy avatar manifest schema');
assert(compatibility.legacyMetaOnly.includes(entry.id), 'expected fixture to be reported as legacy meta-only');
assert(compatibility.dualTrack.length === 0, 'expected fixture not to use manifest+meta dual-track mode');
assert(!dualTrackValidation.ok, 'expected manifest+meta dual-track registry entries to be rejected');
assert(
  requestedPaths[0] === `public/avatars/${entry.id}/manifest.json`,
  'expected manifest.json to be attempted first'
);
assert(
  requestedPaths[1] === `${fixtureRoot}/meta.json`,
  'expected meta.json to be attempted only after manifest failure'
);

console.log('[check-legacy-avatar] ok');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function stripQuery(path) {
  return String(path || '').split('?')[0];
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[check-legacy-avatar] ${message}`);
    process.exit(1);
  }
}
