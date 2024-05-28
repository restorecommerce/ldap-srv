import { Worker } from './worker.js';

const worker = new Worker();

worker.start().then().catch((err) => {
  worker.logger.error('startup error', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  worker.stop().then().catch((err) => {
    worker.logger.error('shutdown error', err);
    process.exit(1);
  });
});
