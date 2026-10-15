import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';

describe('Modal', () => {
  it('closes only the innermost modal on Escape when nested', () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <Modal isOpen onClose={closeOuter} title="Outer">
        <Modal isOpen onClose={closeInner} title="Inner">
          body
        </Modal>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it('closes the outer modal on Escape once the inner one has gone', () => {
    const closeOuter = vi.fn();
    const { rerender } = render(
      <Modal isOpen onClose={closeOuter} title="Outer">
        <Modal isOpen onClose={vi.fn()} title="Inner">
          body
        </Modal>
      </Modal>
    );
    rerender(
      <Modal isOpen onClose={closeOuter} title="Outer">
        <Modal isOpen={false} onClose={vi.fn()} title="Inner">
          body
        </Modal>
      </Modal>
    );

    // Still locked while the outer modal is open
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeOuter).toHaveBeenCalledTimes(1);
  });

  it('labels each dialog with its own title', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Outer">
        <Modal isOpen onClose={vi.fn()} title="Inner">
          body
        </Modal>
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Inner' })).toBeInTheDocument();
  });

  it('fills the viewport at size full', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Plan" size="full">
        body
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: 'Plan' });
    expect(dialog).toHaveClass('h-full', 'max-w-none');
    expect(dialog).not.toHaveClass('max-w-lg');
  });

  it('keeps Tab inside the dialog, and gives focus back to its opener when it closes', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open licences</button>
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Licences">
            <button>First</button>
            <button>Last</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open licences' });
    opener.focus();
    fireEvent.click(opener);
    // The dialog's own Close button comes first, then its content
    const close = screen.getByRole('button', { name: 'Close' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.click(close);
    expect(document.activeElement).toBe(opener);
  });
});
