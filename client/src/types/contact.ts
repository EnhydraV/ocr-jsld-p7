import type { Organization } from './organization';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  position?: string;
  organizationId?: string;
  organization?: Organization;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  position?: string;
  organizationId?: string;
}

export interface UpdateContactInput extends Partial<CreateContactInput> {}
