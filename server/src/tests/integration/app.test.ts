import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('GET /api/health', () => {
  it('returns 200 with an OK status', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'OK', message: 'Orion CRM API is running' });
  });
});

describe('unknown routes', () => {
  it('returns 404 with an error body', async () => {
    const response = await request(app).get('/api/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Route not found' });
  });
});

describe('CORS policy', () => {
  // Garde-fou de non-régression (Sonar S5122) : l'API ne doit émettre aucun
  // en-tête CORS, toute requête cross-origin est donc bloquée par le navigateur
  it('does not allow any cross-origin request', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
