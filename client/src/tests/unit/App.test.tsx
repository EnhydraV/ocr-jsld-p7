import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../App';
import { contactService } from '../../services/contactService';
import { organizationService } from '../../services/organizationService';

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

vi.mock('../../services/organizationService', () => ({
  organizationService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn(),
  },
}));

describe('App', () => {
  it('renders the dashboard with the stats returned by the API', async () => {
    vi.mocked(contactService.getStats).mockResolvedValue({ total: 4 });
    vi.mocked(organizationService.getStats).mockResolvedValue({ total: 2 });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Total Contacts')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Total Organizations')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
