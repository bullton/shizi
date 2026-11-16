const fs = require('fs');
const path = require('path');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg'
};

function sendFile(res, filePath, contentType, req) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const type = contentType || mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = req && req.headers ? req.headers.range : null;
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      let start = match[1] ? Number(match[1]) : 0;
      let end = match[2] ? Number(match[2]) : data.length - 1;
      if (!match[1] && match[2]) {
        start = Math.max(0, data.length - Number(match[2]));
        end = data.length - 1;
      }
      if (start <= end && start < data.length) {
        const chunk = data.subarray(start, Math.min(end, data.length - 1) + 1);
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': 'bytes ' + start + '-' + (start + chunk.length - 1) + '/' + data.length,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length
        });
        res.end(chunk);
        return;
      }
      res.writeHead(416, { 'Content-Range': 'bytes */' + data.length });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': data.length });
    res.end(data);
  });
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    cookies[name.trim()] = rest.join('=').trim();
  });
  return cookies;
}

function setSessionCookie(res, sessionId, expires) {
  res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax${expires ? '; Expires=' + new Date(expires).toUTCString() : ''}`);
}

module.exports = {
  mimeTypes,
  sendFile,
  parseBody,
  jsonResponse,
  parseCookies,
  setSessionCookie
};
