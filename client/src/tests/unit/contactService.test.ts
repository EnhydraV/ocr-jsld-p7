import { describe, it, expect, vi, beforeEach } from 'vitest';

// L'instance axios est créée à l'import du service : on mocke axios.create en amont
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => apiMock),
  },
}));

import { contactService } from '../../services/contactService';

const contact = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  firstName: 'Juliette',
  lastName: 'Michel',
  email: 'juliette.michel@example.com',
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-01T10:00:00Z',
};

describe('contactService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAll fetches the contact list', async () => {
    apiMock.get.mockResolvedValue({ data: [contact] });

    await expect(contactService.getAll()).resolves.toEqual([contact]);
    expect(apiMock.get).toHaveBeenCalledWith('/contacts');
  });

  it('getById fetches a single contact', async () => {
    apiMock.get.mockResolvedValue({ data: contact });

    await expect(contactService.getById(contact.id)).resolves.toEqual(contact);
    expect(apiMock.get).toHaveBeenCalledWith(`/contacts/${contact.id}`);
  });

  it('create posts the new contact', async () => {
    const input = { firstName: 'Juliette', lastName: 'Michel', email: 'juliette.michel@example.com' };
    apiMock.post.mockResolvedValue({ data: contact });

    await expect(contactService.create(input)).resolves.toEqual(contact);
    expect(apiMock.post).toHaveBeenCalledWith('/contacts', input);
  });

  it('update puts the changes', async () => {
    apiMock.put.mockResolvedValue({ data: { ...contact, position: 'CTO' } });

    await expect(contactService.update(contact.id, { position: 'CTO' })).resolves.toMatchObject({
      position: 'CTO',
    });
    expect(apiMock.put).toHaveBeenCalledWith(`/contacts/${contact.id}`, { position: 'CTO' });
  });

  it('delete removes the contact', async () => {
    apiMock.delete.mockResolvedValue({});

    await expect(contactService.delete(contact.id)).resolves.toBeUndefined();
    expect(apiMock.delete).toHaveBeenCalledWith(`/contacts/${contact.id}`);
  });

  it('getStats fetches the totals', async () => {
    apiMock.get.mockResolvedValue({ data: { total: 4 } });

    await expect(contactService.getStats()).resolves.toEqual({ total: 4 });
    expect(apiMock.get).toHaveBeenCalledWith('/contacts/stats');
  });

  it('propagates API errors', async () => {
    apiMock.get.mockRejectedValue(new Error('Network Error'));

    await expect(contactService.getAll()).rejects.toThrow('Network Error');
  });
});
