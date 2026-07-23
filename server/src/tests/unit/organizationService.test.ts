import { describe, it, expect, vi, beforeEach } from 'vitest';
import { organizationService } from '../../services/organizationService';
import { organizationRepository } from '../../repositories/organizationRepository';
import { buildOrganization } from '../fixtures';

vi.mock('../../repositories/organizationRepository', () => ({
  organizationRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn(),
  },
}));

describe('organizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAllOrganizations returns every organization from the repository', async () => {
    const organizations = [buildOrganization()];
    vi.mocked(organizationRepository.findAll).mockResolvedValue(organizations);

    await expect(organizationService.getAllOrganizations()).resolves.toEqual(organizations);
  });

  it('getOrganizationById returns the organization when it exists', async () => {
    const organization = buildOrganization();
    vi.mocked(organizationRepository.findById).mockResolvedValue(organization);

    await expect(organizationService.getOrganizationById(organization.id)).resolves.toEqual(organization);
    expect(organizationRepository.findById).toHaveBeenCalledWith(organization.id);
  });

  it('getOrganizationById throws when the organization does not exist', async () => {
    vi.mocked(organizationRepository.findById).mockResolvedValue(null);

    await expect(organizationService.getOrganizationById('missing-id')).rejects.toThrow(
      'Organization not found'
    );
  });

  it('createOrganization delegates to the repository', async () => {
    const input = { name: 'Orion Corp' };
    const created = buildOrganization();
    vi.mocked(organizationRepository.create).mockResolvedValue(created);

    await expect(organizationService.createOrganization(input)).resolves.toEqual(created);
    expect(organizationRepository.create).toHaveBeenCalledWith(input);
  });

  it('updateOrganization updates an existing organization', async () => {
    const organization = buildOrganization();
    const updated = buildOrganization({ industry: 'Aerospace' });
    vi.mocked(organizationRepository.findById).mockResolvedValue(organization);
    vi.mocked(organizationRepository.update).mockResolvedValue(updated);

    await expect(
      organizationService.updateOrganization(organization.id, { industry: 'Aerospace' })
    ).resolves.toEqual(updated);
    expect(organizationRepository.update).toHaveBeenCalledWith(organization.id, {
      industry: 'Aerospace',
    });
  });

  it('updateOrganization throws without touching the repository when the organization is missing', async () => {
    vi.mocked(organizationRepository.findById).mockResolvedValue(null);

    await expect(organizationService.updateOrganization('missing-id', {})).rejects.toThrow(
      'Organization not found'
    );
    expect(organizationRepository.update).not.toHaveBeenCalled();
  });

  it('deleteOrganization deletes an existing organization', async () => {
    const organization = buildOrganization();
    vi.mocked(organizationRepository.findById).mockResolvedValue(organization);
    vi.mocked(organizationRepository.delete).mockResolvedValue(organization);

    await expect(organizationService.deleteOrganization(organization.id)).resolves.toBeUndefined();
    expect(organizationRepository.delete).toHaveBeenCalledWith(organization.id);
  });

  it('deleteOrganization throws without touching the repository when the organization is missing', async () => {
    vi.mocked(organizationRepository.findById).mockResolvedValue(null);

    await expect(organizationService.deleteOrganization('missing-id')).rejects.toThrow(
      'Organization not found'
    );
    expect(organizationRepository.delete).not.toHaveBeenCalled();
  });

  it('getOrganizationStats returns the repository stats', async () => {
    vi.mocked(organizationRepository.getStats).mockResolvedValue({ total: 2 });

    await expect(organizationService.getOrganizationStats()).resolves.toEqual({ total: 2 });
  });
});
