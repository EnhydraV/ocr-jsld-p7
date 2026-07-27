import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import logger from '../../lib/logger';

describe('GET /api/debug/status/:code', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the requested status code with a JSON body', async () => {
    const response = await request(app).get('/api/debug/status/503');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 503 });
  });

  it('returns 204 without a body', async () => {
    const response = await request(app).get('/api/debug/status/204');

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it('rejects a non-numeric code with 400', async () => {
    const response = await request(app).get('/api/debug/status/teapot');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/between 200 and 599/);
  });

  it('rejects an out-of-range code with 400', async () => {
    const response = await request(app).get('/api/debug/status/999');

    expect(response.status).toBe(400);
  });

  it('is logged like any other request', async () => {
    const httpSpy = vi.spyOn(logger, 'http');

    await request(app).get('/api/debug/status/404');

    expect(httpSpy).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({
        method: 'GET',
        url: '/api/debug/status/404',
        status: 404,
      })
    );
  });
});
