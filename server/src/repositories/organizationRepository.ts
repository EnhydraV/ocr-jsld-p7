import { PrismaClient, Organization } from '@prisma/client';
import { CreateOrganizationInput, UpdateOrganizationInput } from '../models/organizationModel';

const prisma = new PrismaClient();

export const organizationRepository = {
  async findAll(): Promise<Organization[]> {
    return prisma.organization.findMany({
      include: {
        contacts: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  async findById(id: string): Promise<Organization | null> {
    return prisma.organization.findUnique({
      where: { id },
      include: {
        contacts: true,
      },
    });
  },

  async create(data: CreateOrganizationInput): Promise<Organization> {
    return prisma.organization.create({
      data,
    });
  },

  async update(id: string, data: UpdateOrganizationInput): Promise<Organization> {
    return prisma.organization.update({
      where: { id },
      data,
    });
  },

  async delete(id: string): Promise<Organization> {
    return prisma.organization.delete({
      where: { id },
    });
  },

  async getStats(): Promise<{ total: number }> {
    const total = await prisma.organization.count();
    return { total };
  },
};
