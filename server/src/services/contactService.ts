import { Contact } from '@prisma/client';
import { contactRepository } from '../repositories/contactRepository';
import { CreateContactInput, UpdateContactInput } from '../models/contactModel';

export const contactService = {
  async getAllContacts(): Promise<Contact[]> {
    return contactRepository.findAll();
  },

  async getContactById(id: string): Promise<Contact> {
    const contact = await contactRepository.findById(id);
    if (!contact) {
      throw new Error('Contact not found');
    }
    return contact;
  },

  async createContact(data: CreateContactInput): Promise<Contact> {
    return contactRepository.create(data);
  },

  async updateContact(id: string, data: UpdateContactInput): Promise<Contact> {
    await this.getContactById(id);
    return contactRepository.update(id, data);
  },

  async deleteContact(id: string): Promise<void> {
    await this.getContactById(id);
    await contactRepository.delete(id);
  },

  async getContactStats(): Promise<{ total: number }> {
    return contactRepository.getStats();
  },
};
