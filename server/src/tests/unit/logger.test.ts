import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger } from '../../lib/logger';

describe('createLogger', () => {
  it('logs to console only when no Logstash host is configured', () => {
    const logger = createLogger({ NODE_ENV: 'test' });

    expect(logger.transports).toHaveLength(1);
    logger.close();
  });

  it('adds a Logstash transport when LOGSTASH_HOST is set', () => {
    const logger = createLogger({
      NODE_ENV: 'test',
      LOGSTASH_HOST: '127.0.0.1',
      LOGSTASH_PORT: '5000',
    });

    expect(logger.transports).toHaveLength(2);
    logger.close();
  });

  it('defaults to the http level so requests are captured', () => {
    const logger = createLogger({ NODE_ENV: 'test' });

    expect(logger.level).toBe('http');
    logger.close();
  });

  it('is muted during tests to keep the output readable', () => {
    const logger = createLogger({ NODE_ENV: 'test' });

    expect(logger.silent).toBe(true);
    logger.close();
  });
});

// Garde-fou de non-régression : sans écouteur 'error' sur le logger, une panne
// de Logstash tue le process (« Unhandled 'error' event »), winston faisant
// remonter les erreurs de ses transports sur le logger. Constaté en conditions
// réelles, l'API ne servait plus aucune requête.
describe('logger resilience', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('survives an error emitted on the logger itself', () => {
    const logger = createLogger({ NODE_ENV: 'test' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => logger.emit('error', new Error('boom'))).not.toThrow();
    logger.close();
  });

  it('survives an error emitted by the Logstash transport', () => {
    const logger = createLogger({
      NODE_ENV: 'test',
      LOGSTASH_HOST: '127.0.0.1',
      LOGSTASH_PORT: '59999',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logstash = logger.transports[1];

    // Chemin réel : le transport émet, winston relaie sur le logger
    expect(() => logstash.emit('error', new Error('OFFLINE'))).not.toThrow();
    logger.close();
  });
});
