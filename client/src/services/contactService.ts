import axios from 'axios';
import type { Contact, CreateContactInput, UpdateContactInput } from '../types/contact';
import type { Stats } from '../types/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const contactService = {
  getAll: async (): Promise<Contact[]> => {
    const { data } = await api.get<Contact[]>('/contacts');
    return data;
  },

  getById: async (id: string): Promise<Contact> => {
    const { data } = await api.get<Contact>(`/contacts/${id}`);
    return data;
  },

  create: async (input: CreateContactInput): Promise<Contact> => {
    const { data } = await api.post<Contact>('/contacts', input);
    return data;
  },

  update: async (id: string, input: UpdateContactInput): Promise<Contact> => {
    const { data } = await api.put<Contact>(`/contacts/${id}`, input);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/contacts/${id}`);
  },

  getStats: async (): Promise<Stats> => {
    const { data} = await api.get<Stats>('/contacts/stats');
    return data;
  },
};
