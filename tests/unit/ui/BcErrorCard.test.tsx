import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BcErrorCard } from '@/components/ui/BcErrorCard';

const timeout =
  'BC API Error (504): {"error": {"code": "Timeout","message": "Request timed out."}}';

describe('BcErrorCard', () => {
  it('says what failed in plain words, keeping the raw error under Technical details', () => {
    render(
      <BcErrorCard title="Couldn't load this project's time and cost figures" error={timeout} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load this project's time and cost figures"
    );
    expect(screen.getByText(/took too long to answer/)).toBeInTheDocument();
    expect(screen.getByText('Technical details')).toBeInTheDocument();
    expect(screen.getByText(timeout)).not.toBeVisible();
  });

  it('retries with the Retry button', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<BcErrorCard title="Couldn't load this project" error={timeout} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});
