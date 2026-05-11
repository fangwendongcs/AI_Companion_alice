export async function loadJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options
  });
  if (!response.ok) {
    throw new Error(`Failed to load JSON ${path}: HTTP ${response.status}`);
  }
  return response.json();
}
