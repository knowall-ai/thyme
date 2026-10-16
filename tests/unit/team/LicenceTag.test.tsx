import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamTable } from '@/components/team/TeamTable';
import type { TeamTableRow } from '@/components/team/TeamTable';
import { emptyStageHours } from '@/utils';

const row = {
  id: 'r1',
  number: 'R1',
  name: 'Sam Contoso',
  email: '',
  totalHours: 0,
  stages: emptyStageHours(),
  billablePercent: 0,
  isCurrentUser: false,
  photoUrl: null,
  weekly: { hours: 37.5, hoursPerDay: 7.5, defaultHours: 37.5, source: 'default', excluded: false },
  capacity: 37.5,
  completion: 0,
  target: null,
} as unknown as TeamTableRow;

describe('licence tag', () => {
  it('shows its details on hover, a click or the keyboard, and reads them out', () => {
    render(
      <TeamTable
        rows={[row]}
        targetsEnabled={false}
        licenceTags={{
          r1: {
            label: 'BC Essentials Attach',
            details: [
              'Business Central: Business Central Essentials Attach',
              'Microsoft 365: Office 365 E3',
            ],
            warn: true,
          },
        }}
      />
    );
    const tag = screen.getByRole('button', { name: "Sam Contoso's licence: BC Essentials Attach" });
    const details = screen.getByRole('tooltip', { hidden: true });
    // Described by the details even when closed, for screen readers
    expect(tag).toHaveAttribute('aria-describedby', details.id);
    expect(tag).toHaveAttribute('aria-expanded', 'false');

    // A mouse enters before it clicks: the click keeps the details open
    fireEvent.mouseEnter(tag.parentElement!);
    expect(tag).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(tag);
    expect(tag).toHaveAttribute('aria-expanded', 'true');
    // Pinned by the click: still open once the pointer leaves
    fireEvent.mouseLeave(tag.parentElement!);
    expect(tag).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Microsoft 365: Office 365 E3');

    fireEvent.keyDown(tag, { key: 'Escape' });
    expect(tag).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens with the keyboard alone (no hover)', () => {
    render(
      <TeamTable
        rows={[row]}
        targetsEnabled={false}
        licenceTags={{
          r1: {
            label: 'BC Essentials',
            details: ['Business Central: Business Central Essentials'],
            warn: false,
          },
        }}
      />
    );
    const tag = screen.getByRole('button', { name: /licence: BC Essentials/ });
    fireEvent.click(tag, { detail: 0 });
    expect(tag).toHaveAttribute('aria-expanded', 'true');
  });
});
