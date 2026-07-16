import { z } from 'zod';

// Contact schemas
export const CreateContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  position: z.string().optional(),
  organizationId: z.string().uuid().optional(),
});

export const UpdateContactSchema = CreateContactSchema.partial();

export type CreateContactInput = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;
