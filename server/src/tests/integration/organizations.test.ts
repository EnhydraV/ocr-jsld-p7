import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../lib/prisma';

describe('/api/organizations', () => {
  beforeEach(async () => {
    await prisma.contact.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('POST creates an organization and returns it with a 201', async () => {
    const response = await request(app)
      .post('/api/organizations')
      .send({ name: 'Orion Corp', website: 'https://orion.example.com' });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Orion Corp');
    expect(response.body.id).toBeDefined();
  });

  it('POST rejects an invalid payload with a 400', async () => {
    const response = await request(app).post('/api/organizations').send({ name: '' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid input data' });
  });

  it('GET lists organizations with their contacts', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Orion Corp' } });
    await prisma.contact.create({
      data: {
        firstName: 'Oscar',
        lastName: 'Izé',
        email: 'oscar.ize@example.com',
        organizationId: organization.id,
      },
    });

    const response = await request(app).get('/api/organizations');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].contacts).toHaveLength(1);
  });

  it('GET /:id returns 404 for an unknown organization', async () => {
    const response = await request(app).get('/api/organizations/unknown-id');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Organization not found' });
  });

  it('PUT /:id updates the organization', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Orion Corp' } });

    const response = await request(app)
      .put(`/api/organizations/${organization.id}`)
      .send({ industry: 'Aerospace' });

    expect(response.status).toBe(200);
    expect(response.body.industry).toBe('Aerospace');
  });

  it('DELETE /:id removes the organization and detaches its contacts', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Orion Corp' } });
    const contact = await prisma.contact.create({
      data: {
        firstName: 'Oscar',
        lastName: 'Izé',
        email: 'oscar.ize@example.com',
        organizationId: organization.id,
      },
    });

    const response = await request(app).delete(`/api/organizations/${organization.id}`);
    expect(response.status).toBe(204);

    // onDelete: SetNull — le contact survit, détaché de l'organisation
    const detached = await prisma.contact.findUnique({ where: { id: contact.id } });
    expect(detached?.organizationId).toBeNull();
  });

  it('GET /stats returns the total number of organizations', async () => {
    await prisma.organization.create({ data: { name: 'Orion Corp' } });

    const response = await request(app).get('/api/organizations/stats');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ total: 1 });
  });
});
