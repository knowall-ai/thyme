import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  fetchProjects: vi.fn(),
  getCustomers: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/services/bc', () => ({
  bcClient: { getCustomers: mocks.getCustomers, createProject: mocks.createProject },
}));

vi.mock('@/hooks', () => ({
  useCompanyPath: () => (path: string) => `/sandbox/cronus${path}`,
  useProjectsStore: (selector: (s: { fetchProjects: () => void }) => unknown) =>
    selector({ fetchProjects: mocks.fetchProjects }),
}));

vi.mock('@/hooks/useProjectDetailsStore', () => ({ PROJECT_NAME_MAX_LENGTH: 100 }));

import { NewProjectModal, describeCreateProjectError } from '@/components/projects/NewProjectModal';

// CRONUS UK Ltd. demo customers
const customers = [
  { id: 'c2', number: '20000', displayName: 'Trey Research' },
  { id: 'c1', number: '10000', displayName: 'Adatum Corporation' },
];

function renderModal(onClose = vi.fn()) {
  render(<NewProjectModal isOpen onClose={onClose} />);
  return { onClose };
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /Create project/ }));

describe('NewProjectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCustomers.mockResolvedValue(customers);
  });

  it('lists customers by name after the internal option', async () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Adatum Corporation (10000)' });
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      'No customer (internal)',
      'Adatum Corporation (10000)',
      'Trey Research (20000)',
    ]);
  });

  it('requires a name before calling Business Central', async () => {
    renderModal();
    await screen.findByRole('option', { name: 'Trey Research (20000)' });

    submit();

    expect(await screen.findByText('Enter a project name')).toBeInTheDocument();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Contoso website' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-01' } });

    submit();

    expect(screen.getByText('The end date must be on or after the start date')).toBeInTheDocument();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it('creates the project, refreshes the list and opens the new project', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    mocks.createProject.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
    const { onClose } = renderModal();
    await screen.findByRole('option', { name: 'Trey Research (20000)' });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Contoso website ' } });
    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-15' } });
    submit();

    // Disabled while BC saves
    await waitFor(() => expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled());
    expect(mocks.createProject).toHaveBeenCalledWith({
      displayName: 'Contoso website',
      billToCustomerNo: '20000',
      startingDate: '2026-10-15',
      endingDate: undefined,
    });

    resolveCreate({ id: 'p1', number: 'PR00150', displayName: 'Contoso website' });

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/sandbox/cronus/projects/PR00150')
    );
    expect(mocks.fetchProjects).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("explains when BC won't let the user create projects", async () => {
    mocks.createProject.mockRejectedValue(
      new Error('BC API Error (403): {"error":{"code":"Forbidden","message":"No access"}}')
    );
    const { onClose } = renderModal();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Contoso website' } });

    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have permission to create projects in Business Central"
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Create project/ })).toBeEnabled();
  });

  it('still allows an internal project when customers fail to load', async () => {
    mocks.getCustomers.mockRejectedValue(new Error('BC API Error (504): timeout'));
    renderModal();

    expect(
      await screen.findByText(/Couldn't load customers from Business Central/)
    ).toBeInTheDocument();
  });
});

describe('describeCreateProjectError', () => {
  it("shows BC's reason for other refusals, without the correlation id", () => {
    const error = new Error(
      'BC API Error (400): {"error":{"code":"Internal_RecordNotFound","message":"Customer 99999 does not exist.  CorrelationId:  abc."}}'
    );
    expect(describeCreateProjectError(error)).toBe('Customer 99999 does not exist.');
  });

  it('treats a missing-permission message as a permission error', () => {
    const error = new Error(
      'BC API Error (400): {"error":{"message":"You do not have the following permissions on TableData Job: Insert"}}'
    );
    expect(describeCreateProjectError(error)).toBe(
      "You don't have permission to create projects in Business Central"
    );
  });
});
