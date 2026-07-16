import { Organization } from '@prisma/client';
import { organizationRepository } from '../repositories/organizationRepository';
import { CreateOrganizationInput, UpdateOrganizationInput } from '../models/organizationModel';

export const organizationService = {
  async getAllOrganizations(): Promise<Organization[]> {
    return organizationRepository.findAll();
  },

  async getOrganizationById(id: string): Promise<Organization> {
    const organization = await organizationRepository.findById(id);
    if (!organization) {
      throw new Error('Organization not found');
    }
    return organization;
  },

  async createOrganization(data: CreateOrganizationInput): Promise<Organization> {
    return organizationRepository.create(data);
  },

  async updateOrganization(id: string, data: UpdateOrganizationInput): Promise<Organization> {
    await this.getOrganizationById(id);
    return organizationRepository.update(id, data);
  },

  async deleteOrganization(id: string): Promise<void> {
    await this.getOrganizationById(id);
    await organizationRepository.delete(id);
  },

  async getOrganizationStats(): Promise<{ total: number }> {
    return organizationRepository.getStats();
  },
};
