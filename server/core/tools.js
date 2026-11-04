const fs = require('fs');
const path = require('path');

function entryExists(rootDir, entry) {
  if (!entry) return false;
  const clean = String(entry).replace(/^\/+/, '');
  const target = path.join(rootDir, clean);
  if (entry.endsWith('/')) return fs.existsSync(path.join(target, 'index.html'));
  return fs.existsSync(target);
}

function readTools(rootDir) {
  const toolsDir = path.join(rootDir, 'tools');
  let ids = [];
  try {
    ids = fs.readdirSync(toolsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    return [];
  }

  const tools = [];
  for (const id of ids) {
    const manifestPath = path.join(toolsDir, id, 'tool.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const entry = manifest.entry || null;
      const available = entryExists(rootDir, entry);
      tools.push({
        id,
        name: manifest.name || id,
        short: manifest.short || manifest.name || id,
        entry,
        weight: Number.isFinite(Number(manifest.weight)) ? Number(manifest.weight) : 0.1,
        order: Number.isFinite(Number(manifest.order)) ? Number(manifest.order) : 100,
        active: manifest.active !== false && available,
        available,
        accent: manifest.accent || '#5546b8',
        icon: manifest.icon || 'grid',
        desc: manifest.desc || ''
      });
    } catch (error) {
      console.warn(`[tools] 讀取 ${manifestPath} 失敗：${error.message}`);
    }
  }

  return tools.sort((a, b) => b.weight - a.weight || a.order - b.order || a.id.localeCompare(b.id));
}

module.exports = { readTools, entryExists };
