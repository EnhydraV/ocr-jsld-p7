import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import logger from '../../lib/logger';

describe('HTTP logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs each request as a structured event', async () => {
    const httpSpy = vi.spyOn(logger, 'http');

    await request(app).get('/api/organizations');

    expect(httpSpy).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({
        method: 'GET',
        url: '/api/organizations',
        status: 200,
        responseTimeMs: expect.any(Number),
      })
    );
  });

  it('does not log the Docker health check pings', async () => {
    const httpSpy = vi.spyOn(logger, 'http');

    await request(app).get('/api/health');

    expect(httpSpy).not.toHaveBeenCalled();
  });
});
