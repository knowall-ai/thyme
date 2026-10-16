import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PlanTotalCell } from '@/components/plan/PlanTotalCell';

const from = new Date(2026, 9, 12);
const to = new Date(2026, 10, 1);
// 78h already past, 152h from 16 Oct on
const days = new Map([
  ['2026-09-30', 78],
  ['2026-10-16', 100],
  ['2026-11-20', 52],
]);

afterEach(() => {
  vi.useRealTimers();
});

describe('PlanTotalCell', () => {
  it("shows the in view total, and what's planned beyond it on hover", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 16, 10));
    render(<PlanTotalCell hours={114} plannedDays={days} from={from} to={to} />);
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
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('stays open while the pointer moves onto the note', () => {
    vi.useFakeTimers();
    render(<PlanTotalCell hours={114} plannedDays={days} from={from} to={to} />);
    const total = screen.getByRole('button', { name: '114h planned in view' });
    fireEvent.mouseEnter(total);
    fireEvent.mouseLeave(total);
    fireEvent.mouseEnter(screen.getByRole('tooltip'));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole('tooltip'));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('works out "from today" as it opens, so a Plan left open overnight is current', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 16, 10));
    render(<PlanTotalCell hours={114} plannedDays={days} from={from} to={to} />);
    const total = screen.getByRole('button', { name: '114h planned in view' });

    vi.setSystemTime(new Date(2026, 9, 17, 9));
    fireEvent.mouseEnter(total);
    expect(screen.getByRole('tooltip')).toHaveTextContent('From today52h');
  });

  it('follows a reload of the plan while the note is open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 16, 10));
    const { rerender } = render(
      <PlanTotalCell hours={114} plannedDays={days} from={from} to={to} />
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: '114h planned in view' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('All weeks230h');

    rerender(
      <PlanTotalCell
        hours={114}
        plannedDays={new Map([...days, ['2026-12-01', 8]])}
        from={from}
        to={to}
      />
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('From today160h');
    expect(screen.getByRole('tooltip')).toHaveTextContent('All weeks238h');
  });

  it('opens on focus, says a person is across projects, and closes on Escape', () => {
    render(<PlanTotalCell hours={0} plannedDays={days} from={from} to={to} isPerson />);
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
