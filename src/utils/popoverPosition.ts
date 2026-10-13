/** Space kept between the popover and its anchor, and between the popover and the screen edge */
const GAP = 6;
const EDGE = 8;

interface Size {
  width: number;
  height: number;
}

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Where to put a popover anchored to an element, in viewport coordinates: below the element and
 * lined up with its left edge, flipping to line up with its right edge when it would run
 * off the right of the screen (e.g. the week grid's Sat/Sun columns), and above it when there's no
 * room below. Always kept inside the screen.
 */
export function computePopoverPosition(
  anchor: AnchorRect,
  popover: Size,
  viewport: Size
): { top: number; left: number; placement: 'top' | 'bottom' } {
  let left = anchor.left;
  if (left + popover.width > viewport.width - EDGE) left = anchor.right - popover.width;
  left = Math.max(EDGE, Math.min(left, viewport.width - EDGE - popover.width));

  const spaceBelow = viewport.height - anchor.bottom - GAP - EDGE;
  const spaceAbove = anchor.top - GAP - EDGE;
  const placement = popover.height > spaceBelow && spaceAbove > spaceBelow ? 'top' : 'bottom';
  let top = placement === 'bottom' ? anchor.bottom + GAP : anchor.top - GAP - popover.height;
  top = Math.max(EDGE, Math.min(top, viewport.height - EDGE - popover.height));

  return { top, left, placement };
}
