import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageBar, getStageSegments } from '@/components/ui/StageBar';

const stages = (approved: number) =>
  getStageSegments({ posted: 0.5, approved, submitted: 0, unsubmitted: 0 });

describe('StageBar estimate marker', () => {
  it('marks where the hours went past the estimate', () => {
    // 42.5h against a 37.6h estimate: the bar is the time spent, the line at the estimate
    render(<StageBar segments={stages(42)} max={42.5} estimate={37.6} />);
    const marker = screen.getByTestId('estimate-marker');
    expect(marker.style.left).toBe(`${(37.6 / 42.5) * 100}%`);
    expect(marker).toHaveAttribute('title', 'Estimate: 37.6h');
  });

  it('shows no marker within the estimate, or without one', () => {
    const { rerender } = render(<StageBar segments={stages(20)} max={37.6} estimate={37.6} />);
    expect(screen.queryByTestId('estimate-marker')).toBeNull();
    rerender(<StageBar segments={stages(42)} max={42.5} />);
    expect(screen.queryByTestId('estimate-marker')).toBeNull();
    rerender(<StageBar segments={stages(42)} max={42.5} estimate={0} />);
    expect(screen.queryByTestId('estimate-marker')).toBeNull();
  });
});
