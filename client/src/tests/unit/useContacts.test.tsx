import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContacts, useCreateContact, useDeleteContact } from '../../hooks/useContacts';
import { contactService } from '../../services/contactService';
import type { Contact } from '../../types/contact';

vi.mock('../../services/contactService', () => ({
  contactService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn(),
  },
}));

const contact: Contact = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  firstName: 'Victor',
  lastName: 'Pille',
  email: 'victor.pille@example.com',
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-01-01T10:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the contact list on success', async () => {
    vi.mocked(contactService.getAll).mockResolvedValue([contact]);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useContacts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([contact]);
  });

  it('exposes the error state on failure', async () => {
    vi.mocked(contactService.getAll).mockRejectedValue(new Error('Network Error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useContacts(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useCreateContact', () => {
  it('creates the contact and invalidates the contact list', async () => {
    vi.mocked(contactService.create).mockResolvedValue(contact);
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateContact(), { wrapper });
    const input = { firstName: 'Victor', lastName: 'Pille', email: 'victor.pille@example.com' };
    await result.current.mutateAsync(input);

    expect(contactService.create).toHaveBeenCalledWith(input);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contacts'] });
  });
});

describe('useDeleteContact', () => {
  it('deletes the contact and invalidates the contact list', async () => {
    vi.mocked(contactService.delete).mockResolvedValue(undefined);
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteContact(), { wrapper });
    await result.current.mutateAsync(contact.id);

    expect(contactService.delete).toHaveBeenCalledWith(contact.id);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contacts'] });
  });
});
