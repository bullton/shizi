const http = require('http');
const fs = require('fs');
const path = require('path');

const { sendFile, jsonResponse, mimeTypes } = require('./core/http');
const { createStore } = require('./core/store');
const { createAuth, PUBLIC_API } = require('./core/auth');
const { readTools } = require('./core/tools');

const rootDir = path.join(__dirname, '..');
const legacyDataFile = path.join(rootDir, 'shizi-data.json');
const dataFile = process.env.SHIZI_DATA_FILE || path.join(rootDir, 'data', 'shizi.json');

if (!process.env.SHIZI_DATA_FILE) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  if (!fs.existsSync(dataFile) && fs.existsSync(legacyDataFile)) {
    fs.copyFileSync(legacyDataFile, dataFile);
    console.log('[shizi] 已由 shizi-data.json 建立 data/shizi.json');
  }
}

const store = createStore(dataFile, {
  users: [],
  progress: [],
  attempts: [],
  chars: [],
  assignments: [],
  config: { aiToken: '' }
});

const auth = createAuth({ db: store.data, saveData: store.save });
const toolModules = loadToolModules();

function loadToolModules() {
  const toolsDir = path.join(__dirname, 'tools');
  const modules = new Map();
  for (const file of fs.readdirSync(toolsDir)) {
    if (!file.endsWith('.js') || file.startsWith('.')) continue;
    const mod = require(path.join(toolsDir, file));
    if (!mod || !mod.id || typeof mod.create !== 'function') continue;
    modules.set(mod.id, mod.create({
      rootDir,
      toolDir: path.join(rootDir, 'tools', mod.id),
      db: store.data,
      saveData: store.save,
      dataExists: store.exists,
      auth
    }));
  }
  return modules;
}

function toolForPath(pathname) {
  const match = pathname.match(/^\/api\/([a-z0-9-]+)(?:\/|$)/);
  if (match && toolModules.has(match[1])) {
    return { id: match[1], handler: toolModules.get(match[1]) };
  }
  return { id: 'shizi', handler: toolModules.get('shizi') };
}

function stripToolPrefix(parsedUrl, id) {
  const prefix = '/api/' + id;
  if (parsedUrl.pathname.indexOf(prefix) !== 0) return parsedUrl;
  return {
    ...parsedUrl,
    pathname: '/api' + parsedUrl.pathname.slice(prefix.length)
  };
}

const staticExt = new Set([
  '.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg',
  '.webp', '.ico', '.woff', '.woff2', '.ttf'
]);

function requestUrl(req) {
  const parsed = new URL(req.url, 'http://localhost');
  return {
    pathname: parsed.pathname,
    query: Object.fromEntries(parsed.searchParams.entries())
  };
}

function serveStatic(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  if (pathname === '/index.html') {
    res.writeHead(302, { Location: '/tools/shizi/' });
    res.end();
    return;
  }

  if (pathname !== '/' && !pathname.endsWith('/')) {
    const possibleDir = path.resolve(path.join(rootDir, pathname));
    if (possibleDir.startsWith(rootDir + path.sep) && fs.existsSync(possibleDir) && fs.statSync(possibleDir).isDirectory()) {
      res.writeHead(302, { Location: pathname + '/' });
      res.end();
      return;
    }
  }

  const manifestMatch = pathname.match(/^\/tools\/([a-z0-9-]+)\/tool\.json$/);
  if (manifestMatch && req.method === 'GET') {
    sendFile(res, path.join(rootDir, 'tools', manifestMatch[1], 'tool.json'));
    return;
  }

  let requestPath = pathname === '/' ? 'hub/index.html' : pathname;
  if (requestPath.endsWith('/')) requestPath += 'index.html';

  const filePath = path.resolve(path.join(rootDir, requestPath));
  const hidden = filePath.split(path.sep).some(segment => segment.startsWith('.'));
  const ext = path.extname(filePath).toLowerCase();
  if (!filePath.startsWith(rootDir + path.sep) || hidden || !staticExt.has(ext)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  sendFile(res, filePath, mimeTypes[ext]);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = requestUrl(req);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/platform/tools' && req.method === 'GET') {
    jsonResponse(res, 200, readTools(rootDir));
    return;
  }

  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API.has(pathname)) {
      const handled = await auth.handleAuthAPI(req, res, pathname, req.method);
      if (!handled) jsonResponse(res, 404, { error: 'API Not Found' });
      return;
    }

    const user = auth.requireAuth(req);
    if (!user) {
      jsonResponse(res, 401, { error: '請先登入' });
      return;
    }

    const tool = toolForPath(pathname);
    if (!tool.handler) {
      jsonResponse(res, 404, { error: 'Tool Not Found' });
      return;
    }
    await tool.handler.handleAPI(req, res, stripToolPrefix(parsedUrl, tool.id));
    return;
  }

  serveStatic(req, res, parsedUrl);
});

const PORT = process.env.PORT || process.argv[2] || 3000;
server.listen(PORT, () => {
  console.log(`識字樂平台運行在 http://localhost:${PORT}/`);
});

module.exports = { server };
