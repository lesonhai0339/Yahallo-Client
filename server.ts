import 'zone.js/node';
import './src/server-shims';

import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
// `esModuleInterop` dang bat nen `import * as express` khong goi duoc.
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import AppServerModule from './src/main.server';
import { RESPONSE_CONTEXT, ResponseContext } from './src/app/core/tokens/response-context';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const distFolder = join(process.cwd(), 'dist/yahallo-client-refactor/browser');
  const indexHtml = existsSync(join(distFolder, 'index.original.html'))
    ? join(distFolder, 'index.original.html')
    : join(distFolder, 'index.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', distFolder);

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser
  server.get('*.*', express.static(distFolder, {
    maxAge: '1y'
  }));

  // Khu quản trị KHÔNG render phía server: nó nằm sau đăng nhập nên không cần
  // SEO, lại đụng nhiều API trình duyệt. Trả thẳng shell để client tự dựng.
  server.get('/admin', (_req, res) => res.sendFile(indexHtml));
  server.get('/admin/*', (_req, res) => res.sendFile(indexHtml));

  // All regular routes use the Angular engine
  server.get('*', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    // Object MỚI cho mỗi request. Dùng chung một object cho cả tiến trình Node
    // sẽ rò status của người này sang người khác. ErrorPageComponent ghi vào
    // đây trong lúc render; đọc lại sau khi render xong.
    const responseContext: ResponseContext = { status: 200 };

    commonEngine
      .render({
        bootstrap: AppServerModule,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: distFolder,
        providers: [
          { provide: APP_BASE_HREF, useValue: baseUrl },
          { provide: RESPONSE_CONTEXT, useValue: responseContext },
        ],
      })
      .then((html) => res.status(responseContext.status).send(html))
      .catch((err) => next(err));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

// Webpack will replace 'require' with '__webpack_require__'
// '__non_webpack_require__' is a proxy to Node 'require'
// The below code is to ensure that the server is run only when not requiring the bundle.
declare const __non_webpack_require__: NodeRequire;
const mainModule = __non_webpack_require__.main;
const moduleFilename = mainModule && mainModule.filename || '';
if (moduleFilename === __filename || moduleFilename.includes('iisnode')) {
  run();
}

export default AppServerModule;
