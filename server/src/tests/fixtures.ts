import { Contact, Organization } from '@prisma/client';

// Fabriques de données de test : valeurs complètes conformes aux types Prisma
export function buildContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    firstName: 'Juliette',
    lastName: 'Michel',
    email: 'juliette.michel@example.com',
    phone: null,
    position: null,
    organizationId: null,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

export function buildOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: '9c858901-8a57-4791-81fe-4c455b099bc9',
    name: 'Orion Corp',
    industry: null,
    website: null,
    description: null,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}
