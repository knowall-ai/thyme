import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeEntryModal } from '@/components/timesheet/TimeEntryModal';

const projects = [
  {
    id: 'p1',
    code: 'PR00010',
    name: 'Support',
    customerName: 'Adatum Corporation',
    status: 'active',
    tasks: [{ id: 't1', code: '100', name: 'Support' }],
  },
  {
    id: 'p2',
    code: 'PR00020',
    name: 'Portal',
    customerName: 'Contoso Ltd',
    status: 'active',
    tasks: [{ id: 't2', code: '200', name: 'Build' }],
  },
];

vi.mock('@/hooks', () => ({
  useProjectsStore: () => ({
    projects,
    selectedProject: null,
    selectedTask: null,
    selectProject: vi.fn(),
    selectTask: vi.fn(),
  }),
  useTimeEntriesStore: () => ({
    addEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    entries: [],
  }),
  useSettingsStore: () => ({}),
}));
vi.mock('@/services/auth', () => ({ useAuth: () => ({ account: null }) }));
vi.mock('@/services/bc/bcClient', () => ({
  bcClient: { isExtensionInstalled: () => Promise.resolve(true) },
}));

const open = (prefill: {
  key: string;
  projectCode?: string;
  taskCode?: string;
  hours?: number;
  notes?: string;
}) =>
  render(
    <TimeEntryModal
      isOpen
      onClose={() => {}}
      date="2026-10-06"
      entry={null}
      weekStart={new Date('2026-10-05')}
      prefill={prefill}
    />
  );

const customerSelect = () => screen.getAllByRole('combobox')[1] as HTMLSelectElement;

describe('TimeEntryModal from a suggestion', () => {
  it('leaves the customer unselected when the suggestion has no project', () => {
    open({ key: 's1', hours: 0.75, notes: 'Meeting: Contoso intro' });
    // Adatum sorts first: the old code picked it
    expect([...customerSelect().options].map((o) => o.value)).toContain('Adatum Corporation');
    expect(customerSelect().value).toBe('');
  });

  it("selects the project's customer when the suggestion has a project", () => {
    open({ key: 's2', projectCode: 'PR00020', taskCode: '200', hours: 1 });
    expect(customerSelect().value).toBe('Contoso Ltd');
  });
});

describe('TimeEntryModal for a new manual entry', () => {
  it('leaves the customer unselected instead of defaulting to the first customer', () => {
    render(
      <TimeEntryModal
        isOpen
        onClose={() => {}}
        date="2026-10-09"
        entry={null}
        weekStart={new Date('2026-10-05')}
      />
    );
    expect([...customerSelect().options].map((o) => o.value)).toContain('Adatum Corporation');
    expect(customerSelect().value).toBe('');
  });
});
