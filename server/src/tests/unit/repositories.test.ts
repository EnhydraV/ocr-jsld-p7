import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contactRepository } from '../../repositories/contactRepository';
import { organizationRepository } from '../../repositories/organizationRepository';
import { prisma } from '../../lib/prisma';
import { buildContact, buildOrganization } from '../fixtures';

vi.mock('../../lib/prisma', () => ({
  prisma: {
    contact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    organization: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('contactRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findAll queries contacts with their organization, newest first', async () => {
    const contacts = [buildContact()];
    vi.mocked(prisma.contact.findMany).mockResolvedValue(contacts);

    await expect(contactRepository.findAll()).resolves.toEqual(contacts);
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findById queries a single contact by id', async () => {
    const contact = buildContact();
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(contact);

    await expect(contactRepository.findById(contact.id)).resolves.toEqual(contact);
    expect(prisma.contact.findUnique).toHaveBeenCalledWith({
      where: { id: contact.id },
      include: { organization: true },
    });
  });

  it('create persists the given data', async () => {
    const input = { firstName: 'Juliette', lastName: 'Michel', email: 'juliette.michel@example.com' };
    const created = buildContact();
    vi.mocked(prisma.contact.create).mockResolvedValue(created);

    await expect(contactRepository.create(input)).resolves.toEqual(created);
    expect(prisma.contact.create).toHaveBeenCalledWith({ data: input });
  });

  it('update persists changes for the given id', async () => {
    const updated = buildContact({ position: 'CTO' });
    vi.mocked(prisma.contact.update).mockResolvedValue(updated);

    await expect(contactRepository.update(updated.id, { position: 'CTO' })).resolves.toEqual(updated);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: updated.id },
      data: { position: 'CTO' },
    });
  });

  it('delete removes the contact with the given id', async () => {
    const contact = buildContact();
    vi.mocked(prisma.contact.delete).mockResolvedValue(contact);

    await expect(contactRepository.delete(contact.id)).resolves.toEqual(contact);
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: contact.id } });
  });

  it('getStats returns the contact count', async () => {
    vi.mocked(prisma.contact.count).mockResolvedValue(5);

    await expect(contactRepository.getStats()).resolves.toEqual({ total: 5 });
  });
});

describe('organizationRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findAll queries organizations with their contacts, newest first', async () => {
    const organizations = [buildOrganization()];
    vi.mocked(prisma.organization.findMany).mockResolvedValue(organizations);

    await expect(organizationRepository.findAll()).resolves.toEqual(organizations);
    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      include: { contacts: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findById queries a single organization by id', async () => {
    const organization = buildOrganization();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(organization);

    await expect(organizationRepository.findById(organization.id)).resolves.toEqual(organization);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: organization.id },
      include: { contacts: true },
    });
  });

  it('create persists the given data', async () => {
    const input = { name: 'Orion Corp' };
    const created = buildOrganization();
    vi.mocked(prisma.organization.create).mockResolvedValue(created);

    await expect(organizationRepository.create(input)).resolves.toEqual(created);
    expect(prisma.organization.create).toHaveBeenCalledWith({ data: input });
  });

  it('update persists changes for the given id', async () => {
    const updated = buildOrganization({ industry: 'Aerospace' });
    vi.mocked(prisma.organization.update).mockResolvedValue(updated);

    await expect(
      organizationRepository.update(updated.id, { industry: 'Aerospace' })
    ).resolves.toEqual(updated);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: updated.id },
      data: { industry: 'Aerospace' },
    });
  });

  it('delete removes the organization with the given id', async () => {
    const organization = buildOrganization();
    vi.mocked(prisma.organization.delete).mockResolvedValue(organization);

    await expect(organizationRepository.delete(organization.id)).resolves.toEqual(organization);
    expect(prisma.organization.delete).toHaveBeenCalledWith({ where: { id: organization.id } });
  });

  it('getStats returns the organization count', async () => {
    vi.mocked(prisma.organization.count).mockResolvedValue(2);

    await expect(organizationRepository.getStats()).resolves.toEqual({ total: 2 });
  });
});
