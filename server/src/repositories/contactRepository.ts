import { PrismaClient, Contact } from '@prisma/client';
import { CreateContactInput, UpdateContactInput } from '../models/contactModel';

const prisma = new PrismaClient();

export const contactRepository = {
  async findAll(): Promise<Contact[]> {
    return prisma.contact.findMany({
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  async findById(id: string): Promise<Contact | null> {
    return prisma.contact.findUnique({
      where: { id },
      include: {
        organization: true,
      },
    });
  },

  async create(data: CreateContactInput): Promise<Contact> {
    return prisma.contact.create({
      data,
    });
  },

  async update(id: string, data: UpdateContactInput): Promise<Contact> {
    return prisma.contact.update({
      where: { id },
      data,
    });
  },

  async delete(id: string): Promise<Contact> {
    return prisma.contact.delete({
      where: { id },
    });
  },

  async getStats(): Promise<{ total: number }> {
    const total = await prisma.contact.count();
    return { total };
  },
};
