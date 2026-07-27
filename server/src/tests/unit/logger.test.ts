import { describe, it, expect } from 'vitest';
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
