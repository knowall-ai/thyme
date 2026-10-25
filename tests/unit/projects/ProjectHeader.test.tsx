import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// A CRONUS UK Ltd.-style demo project (hoisted: the mocks below are)
const project = vi.hoisted(() => ({
  id: 'p1',
  code: 'PR-CONTOSO',
  name: 'Contoso Website',
  customerName: 'Contoso Ltd.',
  color: '#00D26A',
  status: 'active',
  startDate: '2026-01-05',
  endDate: '2026-12-18',
}));

vi.mock('@/hooks/useProjectDetailsStore', () => {
  const state = { project, analytics: null, renameProject: vi.fn() };
  return {
    useProjectDetailsStore: (selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state,
    PROJECT_NAME_MAX_LENGTH: 100,
    ProjectRenamePermissionError: class ProjectRenamePermissionError extends Error {},
  };
});

vi.mock('@/hooks', () => ({
  useCompanyPath: () => (path: string) => path,
  useCompanyStore: (selector: (s: { selectedCompany: null }) => unknown) =>
    selector({ selectedCompany: null }),
}));

import { ProjectHeader } from '@/components/projects/ProjectHeader';

describe('ProjectHeader', () => {
  it('prints the page from the Print button, named for the PDF file, then restores the title', () => {
    document.title = 'Timmie';
    let titleWhilePrinting = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      titleWhilePrinting = document.title;
    });
    render(<ProjectHeader />);

    const button = screen.getByRole('button', { name: 'Print' });
    expect(button).toHaveTextContent('Print');
    expect(screen.queryByText('Export PDF')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    expect(titleWhilePrinting).toBe('Contoso Ltd. - PR-CONTOSO - Project Report');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Timmie');
    print.mockRestore();
  });
});
