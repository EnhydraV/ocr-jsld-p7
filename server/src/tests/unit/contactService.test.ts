import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contactService } from '../../services/contactService';
import { contactRepository } from '../../repositories/contactRepository';
import { buildContact } from '../fixtures';

vi.mock('../../repositories/contactRepository', () => ({
  contactRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn(),
  },
}));

describe('contactService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAllContacts returns every contact from the repository', async () => {
    const contacts = [buildContact()];
    vi.mocked(contactRepository.findAll).mockResolvedValue(contacts);

    await expect(contactService.getAllContacts()).resolves.toEqual(contacts);
  });

  it('getContactById returns the contact when it exists', async () => {
    const contact = buildContact();
    vi.mocked(contactRepository.findById).mockResolvedValue(contact);

    await expect(contactService.getContactById(contact.id)).resolves.toEqual(contact);
    expect(contactRepository.findById).toHaveBeenCalledWith(contact.id);
  });

  it('getContactById throws when the contact does not exist', async () => {
    vi.mocked(contactRepository.findById).mockResolvedValue(null);

    await expect(contactService.getContactById('missing-id')).rejects.toThrow('Contact not found');
  });

  it('createContact delegates to the repository', async () => {
    const input = { firstName: 'Juliette', lastName: 'Michel', email: 'juliette.michel@example.com' };
    const created = buildContact();
    vi.mocked(contactRepository.create).mockResolvedValue(created);

    await expect(contactService.createContact(input)).resolves.toEqual(created);
    expect(contactRepository.create).toHaveBeenCalledWith(input);
  });

  it('updateContact updates an existing contact', async () => {
    const contact = buildContact();
    const updated = buildContact({ position: 'CTO' });
    vi.mocked(contactRepository.findById).mockResolvedValue(contact);
    vi.mocked(contactRepository.update).mockResolvedValue(updated);

    await expect(contactService.updateContact(contact.id, { position: 'CTO' })).resolves.toEqual(updated);
    expect(contactRepository.update).toHaveBeenCalledWith(contact.id, { position: 'CTO' });
  });

  it('updateContact throws without touching the repository when the contact is missing', async () => {
    vi.mocked(contactRepository.findById).mockResolvedValue(null);

    await expect(contactService.updateContact('missing-id', {})).rejects.toThrow('Contact not found');
    expect(contactRepository.update).not.toHaveBeenCalled();
  });

  it('deleteContact deletes an existing contact', async () => {
    const contact = buildContact();
    vi.mocked(contactRepository.findById).mockResolvedValue(contact);
    vi.mocked(contactRepository.delete).mockResolvedValue(contact);

    await expect(contactService.deleteContact(contact.id)).resolves.toBeUndefined();
    expect(contactRepository.delete).toHaveBeenCalledWith(contact.id);
  });

  it('deleteContact throws without touching the repository when the contact is missing', async () => {
    vi.mocked(contactRepository.findById).mockResolvedValue(null);

    await expect(contactService.deleteContact('missing-id')).rejects.toThrow('Contact not found');
    expect(contactRepository.delete).not.toHaveBeenCalled();
  });

  it('getContactStats returns the repository stats', async () => {
    vi.mocked(contactRepository.getStats).mockResolvedValue({ total: 3 });

    await expect(contactService.getContactStats()).resolves.toEqual({ total: 3 });
  });
});
