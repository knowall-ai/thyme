'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentType, KeyboardEvent, SVGProps } from 'react';
import { CheckIcon, ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { cn, describeFilterSelection, toggleFilterValue } from '@/utils';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface FilterMenuOption {
  value: string;
  label: string;
  /** A second, smaller line, e.g. a resource or project number */
  description?: string;
  /** A colour dot beside the label, e.g. a project's colour */
  color?: string;
}

export interface FilterMenuProps {
  /** What's filtered, e.g. "Client": the popover's "Filter by Client" heading */
  label: string;
  /** The everything option, e.g. "All Clients" */
  allLabel: string;
  /** Lower case, for the button when several are picked, e.g. "clients" for "3 clients" */
  pluralLabel: string;
  /** Shown on the button */
  icon: Icon;
  /** The picked options' values; none for everything */
  values: readonly string[];
  /**
   * The picked options' names, in the order to list them, including any that aren't
   * among the options (e.g. a client without time in this period)
   */
  valueLabels: readonly string[];
  options: FilterMenuOption[];
  onChange: (values: string[]) => void;
  isLoading?: boolean;
  /** Shown when there are no options */
  emptyMessage?: string;
  /** A search box is shown once there are more options than this */
  searchThreshold?: number;
}

const optionClass =
  'hover:bg-dark-700 focus:bg-dark-700 flex w-full items-center gap-3 px-4 py-2 text-left text-sm focus:outline-none';

// A checkbox-style tick box: options are toggle buttons (aria-pressed), so it's decorative
function Check({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
        checked ? 'border-timmie-500 bg-timmie-500 text-dark-950' : 'border-dark-500'
      )}
    >
      {checked && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

/**
 * A multi-select filter dropdown for Reports: everything, or any number of options,
 * with a search box when the list is long. Each option toggles (Space or Enter), the
 * everything option clears the picks, arrow keys move through the options and Escape
 * closes it.
 */
export function FilterMenu({
  label,
  allLabel,
  pluralLabel,
  icon: TriggerIcon,
  values,
  valueLabels,
  options,
  onChange,
  isLoading = false,
  emptyMessage = 'Nothing to filter by',
  searchThreshold = 8,
}: FilterMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const searchable = options.length > searchThreshold;
  const noneSelected = values.length === 0;
  // "All Clients", a name, or e.g. "3 clients"
  const currentLabel = describeFilterSelection(valueLabels, allLabel, pluralLabel);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(needle))
    : options;

  const close = (refocus: boolean) => {
    setIsOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  };

  // Close on a click or tap anywhere else
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
      setQuery('');
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  // Opening focuses the search box, or the first picked option
  useEffect(() => {
    if (!isOpen) return;
    if (searchRef.current) {
      searchRef.current.focus();
      return;
    }
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    ([...buttons].find((b) => b.getAttribute('aria-pressed') === 'true') ?? buttons[0])?.focus();
  }, [isOpen]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    if (buttons.length === 0) return;
    e.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    // From the search box, down goes to the first option and up to the last
    const next =
      index === -1
        ? e.key === 'ArrowDown'
          ? 0
          : buttons.length - 1
        : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={isOpen ? onKeyDown : undefined}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? close(false) : setIsOpen(true))}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        // Every picked name, e.g. "Client: Contoso Ltd., Fabrikam, Inc."
        aria-label={`${label}: ${noneSelected ? allLabel : valueLabels.join(', ')}`}
        className={cn(
          'flex h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
          'border-dark-600 bg-dark-700 hover:border-dark-500 hover:bg-dark-600 border',
          'focus:border-timmie-500 focus:ring-timmie-500 focus:ring-1 focus:outline-none',
          (isOpen || !noneSelected) && 'border-timmie-500'
        )}
      >
        <TriggerIcon className="text-dark-400 h-4 w-4 shrink-0" />
        <span className="text-dark-200 max-w-[12rem] truncate">{currentLabel}</span>
        <ChevronDownIcon
          className={cn('text-dark-400 h-4 w-4 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          id={popoverId}
          role="group"
          aria-label={`Filter by ${label}`}
          className="border-dark-600 bg-dark-800 absolute right-0 z-50 mt-2 w-72 rounded-lg border shadow-xl"
        >
          <div className="border-dark-600 border-b px-4 py-3">
            <h3 className="text-sm font-medium text-white">Filter by {label}</h3>
          </div>
          {searchable && (
            <div className="border-dark-600 border-b px-3 py-2">
              <div className="relative">
                <MagnifyingGlassIcon className="text-dark-400 pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  aria-label={`Search ${label.toLowerCase()} list`}
                  className="border-dark-600 bg-dark-700 text-dark-100 focus:border-timmie-500 focus:ring-timmie-500 w-full rounded-md border py-1.5 pr-2 pl-8 text-sm focus:ring-1 focus:outline-none"
                />
              </div>
            </div>
          )}
          <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {/* Everything: clears the picks, so it's ticked when there are none */}
            <button
              type="button"
              onClick={() => onChange([])}
              aria-pressed={noneSelected}
              className={cn(optionClass, noneSelected && 'bg-dark-700')}
            >
              <Check checked={noneSelected} />
              <span className="text-dark-200">{allLabel}</span>
            </button>

            {isLoading ? (
              <div className="text-dark-400 px-4 py-3 text-center text-sm">Loading...</div>
            ) : options.length === 0 ? (
              <div className="text-dark-400 px-4 py-3 text-center text-sm">{emptyMessage}</div>
            ) : shown.length === 0 ? (
              <div className="text-dark-400 px-4 py-3 text-center text-sm">No matches</div>
            ) : (
              shown.map((option) => {
                const checked = values.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(toggleFilterValue(values, option.value))}
                    aria-pressed={checked}
                    className={optionClass}
                  >
                    <Check checked={checked} />
                    {option.color && (
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: option.color }}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="text-dark-200 block truncate">{option.label}</span>
                      {option.description && (
                        <span className="text-dark-500 block truncate text-xs">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
