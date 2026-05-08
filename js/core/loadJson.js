export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load JSON ${path}: HTTP ${response.status}`);
  }
  return response.json();
}
