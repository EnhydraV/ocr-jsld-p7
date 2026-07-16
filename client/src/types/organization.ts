import type { Contact } from './contact';

export interface Organization {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  description?: string;
  contacts?: Contact[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationInput {
  name: string;
  industry?: string;
  website?: string;
  description?: string;
}

export interface UpdateOrganizationInput extends Partial<CreateOrganizationInput> {}
