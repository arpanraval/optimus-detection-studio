import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../Modal';

/**
 * Keyboard containment for the shared dialog shell. Every dialog in the app renders through this
 * component, so the trap and the focus return belong here rather than in each caller.
 *
 * Tab order is asserted by driving focus explicitly and firing Tab: jsdom does not implement
 * sequential focus navigation, so the handler's own decision is the thing under test.
 */
function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      {open && (
        <Modal
          title="Review rule changes"
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          footer={<button>Save</button>}
        >
          <button>First action</button>
          <button>Second action</button>
        </Modal>
      )}
    </div>
  );
}

describe('Modal keyboard containment', () => {
  it('moves focus into the dialog when it opens', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    const card = screen.getByRole('dialog').querySelector('[tabindex="-1"]');
    expect(document.activeElement).toBe(card);
  });

  it('wraps Tab from the last control back to the first', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // The close button is the first focusable inside the card, ahead of the body content.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    screen.getByRole('button', { name: 'Close' }).focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
  });

  it('pulls focus back when it has escaped the dialog', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    fireEvent.click(trigger);
    // Focus parked outside the card — the page behind the backdrop is unreachable by mouse but
    // not by keyboard, which is the whole reason a trap exists.
    trigger.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('returns focus to whatever opened it', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    // A real click focuses the button first; fireEvent.click alone does not, and the dialog
    // captures document.activeElement as the thing to hand focus back to.
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
