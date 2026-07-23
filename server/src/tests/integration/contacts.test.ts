import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../lib/prisma';

const validContact = {
  firstName: 'Victor',
  lastName: 'Pille',
  email: 'victor.pille@example.com',
};

describe('/api/contacts', () => {
  beforeEach(async () => {
    await prisma.contact.deleteMany();
    await prisma.organization.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('POST creates a contact and returns it with a 201', async () => {
    const response = await request(app).post('/api/contacts').send(validContact);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(validContact);
    expect(response.body.id).toBeDefined();
  });

  it('POST rejects an invalid payload with a 400', async () => {
    const response = await request(app)
      .post('/api/contacts')
      .send({ ...validContact, email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid input data' });
  });

  it('GET lists contacts with their organization', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Orion Corp' } });
    await prisma.contact.create({
      data: { ...validContact, organizationId: organization.id },
    });

    const response = await request(app).get('/api/contacts');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].organization.name).toBe('Orion Corp');
  });

  it('GET /:id returns the contact when it exists', async () => {
    const contact = await prisma.contact.create({ data: validContact });

    const response = await request(app).get(`/api/contacts/${contact.id}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(validContact.email);
  });

  it('GET /:id returns 404 for an unknown contact', async () => {
    const response = await request(app).get('/api/contacts/unknown-id');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Contact not found' });
  });

  it('PUT /:id updates the contact', async () => {
    const contact = await prisma.contact.create({ data: validContact });

    const response = await request(app)
      .put(`/api/contacts/${contact.id}`)
      .send({ position: 'CTO' });

    expect(response.status).toBe(200);
    expect(response.body.position).toBe('CTO');
  });

  it('PUT /:id returns 404 for an unknown contact', async () => {
    const response = await request(app).put('/api/contacts/unknown-id').send({ position: 'CTO' });

    expect(response.status).toBe(404);
  });

  it('PUT /:id rejects an invalid payload with a 400', async () => {
    const contact = await prisma.contact.create({ data: validContact });

    const response = await request(app)
      .put(`/api/contacts/${contact.id}`)
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
  });

  it('DELETE /:id removes the contact', async () => {
    const contact = await prisma.contact.create({ data: validContact });

    const deleteResponse = await request(app).delete(`/api/contacts/${contact.id}`);
    expect(deleteResponse.status).toBe(204);

    const getResponse = await request(app).get(`/api/contacts/${contact.id}`);
    expect(getResponse.status).toBe(404);
  });

  it('DELETE /:id returns 404 for an unknown contact', async () => {
    const response = await request(app).delete('/api/contacts/unknown-id');

    expect(response.status).toBe(404);
  });

  it('GET /stats returns the total number of contacts', async () => {
    await prisma.contact.create({ data: validContact });
    await prisma.contact.create({
      data: { firstName: 'Charlie', lastName: 'Zthérone', email: 'charlie.ztherone@example.com' },
    });

    const response = await request(app).get('/api/contacts/stats');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ total: 2 });
  });
});
