import { Request, Response } from 'express';
import { organizationService } from '../services/organizationService';
import { CreateOrganizationSchema, UpdateOrganizationSchema } from '../models/organizationModel';

export const organizationController = {
  async getAll(_req: Request, res: Response): Promise<void> {
    try {
      const organizations = await organizationService.getAllOrganizations();
      res.json(organizations);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch organizations' });
    }
  },

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const organization = await organizationService.getOrganizationById(id);
      res.json(organization);
    } catch (error) {
      if (error instanceof Error && error.message === 'Organization not found') {
        res.status(404).json({ error: 'Organization not found' });
      } else {
        res.status(500).json({ error: 'Failed to fetch organization' });
      }
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = CreateOrganizationSchema.parse(req.body);
      const organization = await organizationService.createOrganization(validatedData);
      res.status(201).json(organization);
    } catch (_error) {
      res.status(400).json({ error: 'Invalid input data' });
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedData = UpdateOrganizationSchema.parse(req.body);
      const organization = await organizationService.updateOrganization(id, validatedData);
      res.json(organization);
    } catch (error) {
      if (error instanceof Error && error.message === 'Organization not found') {
        res.status(404).json({ error: 'Organization not found' });
      } else {
        res.status(400).json({ error: 'Invalid input data' });
      }
    }
  },

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await organizationService.deleteOrganization(id);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'Organization not found') {
        res.status(404).json({ error: 'Organization not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete organization' });
      }
    }
  },

  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await organizationService.getOrganizationStats();
      res.json(stats);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  },
};
