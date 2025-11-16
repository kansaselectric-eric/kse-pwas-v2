import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders items', () => {
    render(<KpiCard title="Test KPIs" items={[{ label: 'Reports', value: 5 }]} />);
    expect(screen.getByText('Test KPIs')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});



