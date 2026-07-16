import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contactService } from '../services/contactService';
import type { CreateContactInput, UpdateContactInput } from '../types/contact';

export const useContacts = () => {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: contactService.getAll,
  });
};

export const useContact = (id: string) => {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: () => contactService.getById(id),
    enabled: !!id,
  });
};

export const useCreateContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateContactInput) => contactService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
};

export const useUpdateContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContactInput }) =>
      contactService.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
};

export const useDeleteContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contactService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
};

export const useContactStats = () => {
  return useQuery({
    queryKey: ['contacts', 'stats'],
    queryFn: contactService.getStats,
  });
};
