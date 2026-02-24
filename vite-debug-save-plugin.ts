import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

export function debugSavePlugin(): Plugin {
  let projectRoot = '';

  return {
    name: 'debug-save',
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/__debug/save') {
          return next();
        }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { path: relPath, content } = JSON.parse(body) as { path: string; content: string };

            // Validate path stays within src/data/
            const absPath = path.resolve(projectRoot, relPath);
            const dataDir = path.resolve(projectRoot, 'src/data');
            if (!absPath.startsWith(dataDir + path.sep) && absPath !== dataDir) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Path must be within src/data/' }));
              return;
            }

            fs.writeFileSync(absPath, content, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    },
  };
}
