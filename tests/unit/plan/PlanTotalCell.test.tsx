import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanTotalCell } from '@/components/plan/PlanTotalCell';

const from = new Date(2026, 9, 12);
const to = new Date(2026, 10, 1);

describe('PlanTotalCell', () => {
  it("shows the in view total, and what's planned beyond it on hover", () => {
    render(
      <PlanTotalCell hours={114} planned={{ all: 230, fromToday: 152 }} from={from} to={to} />
    );
    const total = screen.getByRole('button', { name: '114h planned in view' });
    expect(total).toHaveTextContent('114h');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.mouseEnter(total);
    const note = screen.getByRole('tooltip');
    expect(note).toHaveTextContent('In view · 12 Oct – 1 Nov 2026114h');
    expect(note).toHaveTextContent('From today152h');
    expect(note).toHaveTextContent('All weeks230h');
    expect(note).not.toHaveTextContent('Across every project');

    fireEvent.mouseLeave(total);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens on focus, says a person is across projects, and closes on Escape', () => {
    render(
      <PlanTotalCell hours={0} planned={{ all: 40, fromToday: 16 }} from={from} to={to} isPerson />
    );
    fireEvent.focus(screen.getByRole('button', { name: '0h planned in view' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Across every project on the Plan.');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('is just the number until the totals have loaded', () => {
    const { container } = render(<PlanTotalCell hours={7.5} from={from} to={to} />);
    expect(container).toHaveTextContent('7.5h');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
