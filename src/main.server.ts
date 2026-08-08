// Shim phải chạy TRƯỚC khi Angular bootstrap — xem src/server-shims.ts.
import './server-shims';

export { AppServerModule as default } from './app/app.module.server';
