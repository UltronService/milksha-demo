import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/**
 * @param {string} rootDir
 * @param {number} port
 * @returns {Promise<import('node:http').Server>}
 */
export function startStaticServer(rootDir, port) {
  return new Promise(function (resolve, reject) {
    const server = createServer(function (req, res) {
      try {
        const urlPath = (req.url || '/').split('?')[0];
        const safe = urlPath.replace(/\.\./g, '');
        let filePath = join(rootDir, safe.replace(/^\//, ''));
        if (urlPath === '/' || urlPath.endsWith('/')) {
          filePath = join(rootDir, 'index.html');
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ext = extname(filePath);
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.end(readFileSync(filePath));
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', function () {
      resolve(server);
    });
  });
}

/**
 * @param {import('node:http').Server} server
 * @returns {number}
 */
export function serverPort(server) {
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    return 0;
  }
  return addr.port;
}
