import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../../components/Layout';

function renderLayout(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Layout>
        <p>Page content</p>
      </Layout>
    </MemoryRouter>
  );
}

describe('Layout', () => {
  it('renders the brand, the navigation and its children', () => {
    renderLayout('/');

    expect(screen.getByRole('heading', { name: 'Orion CRM' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Contacts' })).toHaveAttribute('href', '/contacts');
    expect(screen.getByRole('link', { name: 'Organizations' })).toHaveAttribute(
      'href',
      '/organizations'
    );
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('highlights the link matching the current route', () => {
    renderLayout('/contacts');

    expect(screen.getByRole('link', { name: 'Contacts' }).className).toContain(
      'border-primary-500'
    );
    expect(screen.getByRole('link', { name: 'Dashboard' }).className).toContain(
      'border-transparent'
    );
  });
});
