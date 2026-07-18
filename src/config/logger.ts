import pino from 'pino';
import { Writable } from 'stream';
import { env } from './env.js';
import { createMongoTransport } from './log-transport.js';

// Em produção: tee stream — escreve em stdout E envia warn+ ao MongoDB
function buildProdStream() {
  const mongoTransport = createMongoTransport();
  return new Writable({
    write(chunk: Buffer, _enc, cb) {
      process.stdout.write(chunk);
      mongoTransport.write(chunk.toString());
      cb();
    },
  });
}

export const logger = env.isProd
  ? pino({ level: 'info', base: { service: 'atlasX' } }, buildProdStream())
  : pino({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
      base: { service: 'atlasX' },
    });
