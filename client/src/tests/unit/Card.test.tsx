import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card from '../../components/Card';

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Card content</Card>);

    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders a header when a title is provided', () => {
    render(<Card title="Statistics">Card content</Card>);

    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument();
  });

  it('renders no heading without a title', () => {
    render(<Card>Card content</Card>);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
