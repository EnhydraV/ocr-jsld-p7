import { Request, Response } from 'express';
import { contactService } from '../services/contactService';
import { CreateContactSchema, UpdateContactSchema } from '../models/contactModel';

export const contactController = {
  async getAll(_req: Request, res: Response): Promise<void> {
    try {
      const contacts = await contactService.getAllContacts();
      res.json(contacts);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch contacts' });
    }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const contact = await contactService.getContactById(id);
      res.json(contact);
    } catch (error) {
      if (error instanceof Error && error.message === 'Contact not found') {
        res.status(404).json({ error: 'Contact not found' });
      } else {
        res.status(500).json({ error: 'Failed to fetch contact' });
      }
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = CreateContactSchema.parse(req.body);
      const contact = await contactService.createContact(validatedData);
      res.status(201).json(contact);
    } catch (_error) {
      res.status(400).json({ error: 'Invalid input data' });
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = UpdateContactSchema.parse(req.body);
      const contact = await contactService.updateContact(id, validatedData);
      res.json(contact);
    } catch (error) {
      if (error instanceof Error && error.message === 'Contact not found') {
        res.status(404).json({ error: 'Contact not found' });
      } else {
        res.status(400).json({ error: 'Invalid input data' });
      }
    }
  },

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await contactService.deleteContact(id);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'Contact not found') {
        res.status(404).json({ error: 'Contact not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete contact' });
      }
    }
  },

  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await contactService.getContactStats();
      res.json(stats);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  },
};
