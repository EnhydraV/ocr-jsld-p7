import axios from 'axios';
import type { Organization, CreateOrganizationInput, UpdateOrganizationInput } from '../types/organization';
import type { Stats } from '../types/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const organizationService = {
  getAll: async (): Promise<Organization[]> => {
    const { data } = await api.get<Organization[]>('/organizations');
    return data;
  },

  getById: async (id: string): Promise<Organization> => {
    const { data } = await api.get<Organization>(`/organizations/${id}`);
    return data;
  },

  create: async (input: CreateOrganizationInput): Promise<Organization> => {
    const { data } = await api.post<Organization>('/organizations', input);
    return data;
  },

  update: async (id: string, input: UpdateOrganizationInput): Promise<Organization> => {
    const { data } = await api.put<Organization>(`/organizations/${id}`, input);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/organizations/${id}`);
  },

  getStats: async (): Promise<Stats> => {
    const { data } = await api.get<Stats>('/organizations/stats');
    return data;
  },
};
