import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeEntryModal } from '@/components/timesheet/TimeEntryModal';

const projects = [
  {
    id: 'p1',
    code: 'PR00010',
    name: 'Support',
    customerNo: 'C00010',
    customerName: 'Adatum Corporation',
    status: 'active',
    tasks: [{ id: 't1', code: '100', name: 'Support' }],
  },
  {
    id: 'p2',
    code: 'PR00020',
    name: 'Portal',
    customerNo: 'C00280',
    customerName: 'Contoso Ltd',
    status: 'active',
    tasks: [{ id: 't2', code: '200', name: 'Build' }],
  },
  {
    // Same customer number as p2 under a different name: one customer, not two
    id: 'p3',
    code: 'PR00030',
    name: 'Hosting',
    customerNo: 'C00280',
    customerName: 'Contoso Limited',
    status: 'active',
    tasks: [{ id: 't3', code: '300', name: 'Run' }],
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
    expect([...customerSelect().options].map((o) => o.value)).toContain('C00010');
    expect(customerSelect().value).toBe('');
  });

  it("selects the project's customer when the suggestion has a project", () => {
    open({ key: 's2', projectCode: 'PR00020', taskCode: '200', hours: 1 });
    expect(customerSelect().value).toBe('C00280');
  });

  it('lists a customer number once even when its projects carry different names', () => {
    open({ key: 's3', projectCode: 'PR00030', taskCode: '300', hours: 1 });
    const options = [...customerSelect().options].filter((o) => o.value);
    expect(options.map((o) => o.value)).toEqual(['C00010', 'C00280']);
    expect(customerSelect().value).toBe('C00280');
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
    expect([...customerSelect().options].map((o) => o.value)).toContain('C00010');
    expect(customerSelect().value).toBe('');
  });
});
