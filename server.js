#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { collectStatus } = require('./data-fetch');

const HOST = '0.0.0.0';
const PORT = 3691;
const ROOT = __dirname;
const CHARACTERS_ROOT = '/Users/kiyokazk/TerraceK/characters';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendFile(res, filePath, method = 'GET') {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(content);
  });
}

function resolveStaticPath(urlPath) {
  if (urlPath.startsWith('/characters/')) {
    const name = path.basename(urlPath);
    return path.join(CHARACTERS_ROOT, name);
  }
  const normalized = urlPath === '/' ? '/index.html' : urlPath;
  const safePath = path.normalize(normalized).replace(/^([.][.][\\/])+/, '');
  const filePath = path.join(ROOT, safePath);
  if (!filePath.startsWith(ROOT)) return null;
  return filePath;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Bad Request' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/api/status') {
    try {
      const data = await collectStatus();
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 500, { error: 'Failed to collect status', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/cron/run') {
    try {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || '{}');
      if (!parsed.jobId || typeof parsed.jobId !== 'string') {
        sendJson(res, 400, { error: 'jobId is required' });
        return;
      }
      execSync(`/usr/local/bin/openclaw cron run ${parsed.jobId}`, { stdio: 'pipe', env: { ...process.env, PATH: `/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}` } });
      sendJson(res, 200, { ok: true, jobId: parsed.jobId, message: '実行を開始しました' });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: 'Failed to run cron job', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method)) {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    sendJson(res, 400, { error: 'Bad Request' });
    return;
  }

  sendFile(res, filePath, req.method);
});

server.listen(PORT, HOST, () => {
  console.log(`Terrace.K Dashboard server running at http://${HOST}:${PORT}`);
});
