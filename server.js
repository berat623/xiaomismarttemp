/**
 * Xiaomi SmartTemp & MGM ALADIN — Zero-Dependency Local Dev Server & MGM Proxy
 * Run with: node server.js
 * Access at: http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. MGM ALADIN PROXY UÇ NOKTASI (Breezy Weather Metodu)
  if (pathname === '/api/aladin') {
    const targetUrl = 'https://modelservis.mgm.gov.tr/web/modeltahmin/lokasyon/light3' + parsedUrl.search;
    
    const proxyReq = https.get(targetUrl, {
      headers: {
        'Origin': 'https://www.mgm.gov.tr',
        'Referer': 'https://www.mgm.gov.tr/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 6000
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      upstreamRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'ProxyError', message: err.message }));
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.writeHead(504, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'TimeoutError', message: 'MGM sunucusu yanıt vermedi' }));
    });

    return;
  }

  // 2. STATİK DOSYA SUNUCUSU
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  const filePath = path.join(ROOT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Xiaomi SmartTemp & MGM ALADIN İstasyonu Aktif!`);
  console.log(`💻 Bilgisayar Yerel Adres: http://localhost:${PORT}`);
  console.log(`📱 Telefon Wi-Fi Adresi:   http://192.168.1.22:${PORT}`);
  console.log(`🌦️ MGM ALADIN Canlı Proxy: http://localhost:${PORT}/api/aladin\n`);
});
