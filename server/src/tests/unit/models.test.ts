import { describe, it, expect } from 'vitest';
import { CreateContactSchema, UpdateContactSchema } from '../../models/contactModel';
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
} from '../../models/organizationModel';

describe('CreateContactSchema', () => {
  it('accepts a valid payload', () => {
    const result = CreateContactSchema.safeParse({
      firstName: 'Juliette',
      lastName: 'Michel',
      email: 'juliette.michel@example.com',
      phone: '+33612345678',
      position: 'CTO',
      organizationId: '9c858901-8a57-4791-81fe-4c455b099bc9',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a minimal payload without optional fields', () => {
    const result = CreateContactSchema.safeParse({
      firstName: 'Juliette',
      lastName: 'Michel',
      email: 'juliette.michel@example.com',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty first name', () => {
    const result = CreateContactSchema.safeParse({
      firstName: '',
      lastName: 'Michel',
      email: 'juliette.michel@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = CreateContactSchema.safeParse({
      firstName: 'Juliette',
      lastName: 'Michel',
      email: 'not-an-email',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid organizationId', () => {
    const result = CreateContactSchema.safeParse({
      firstName: 'Juliette',
      lastName: 'Michel',
      email: 'juliette.michel@example.com',
      organizationId: '42',
    });

    expect(result.success).toBe(false);
  });
});

describe('UpdateContactSchema', () => {
  it('accepts a partial payload', () => {
    expect(UpdateContactSchema.safeParse({ position: 'CEO' }).success).toBe(true);
  });

  it('still validates provided fields', () => {
    expect(UpdateContactSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('CreateOrganizationSchema', () => {
  it('accepts a valid payload', () => {
    const result = CreateOrganizationSchema.safeParse({
      name: 'Orion Corp',
      industry: 'Aerospace',
      website: 'https://orion.example.com',
      description: 'CRM software vendor',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(CreateOrganizationSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects an invalid website but accepts an empty string', () => {
    expect(CreateOrganizationSchema.safeParse({ name: 'Orion', website: 'not-a-url' }).success).toBe(
      false
    );
    expect(CreateOrganizationSchema.safeParse({ name: 'Orion', website: '' }).success).toBe(true);
  });
});

describe('UpdateOrganizationSchema', () => {
  it('accepts a partial payload', () => {
    expect(UpdateOrganizationSchema.safeParse({ industry: 'Retail' }).success).toBe(true);
  });
});
