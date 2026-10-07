'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  FunnelIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import {
  PROJECT_STATUS_OPTIONS,
  projectStatusSummary,
  toggleProjectStatus,
  type ProjectStatus,
} from '@/utils/projectStatusFilter';
import { cn } from '@/utils/cn';

interface ProjectStatusFilterProps {
  value: ProjectStatus[];
  onChange: (value: ProjectStatus[]) => void;
}

/** Multi-select status filter: a button opening a checkbox listbox, plus an info tooltip. */
export function ProjectStatusFilter({ value, onChange }: ProjectStatusFilterProps) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const infoId = useId();

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Move focus into the list when it opens
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const last = PROJECT_STATUS_OPTIONS.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, last));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(last);
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        onChange(toggleProjectStatus(value, PROJECT_STATUS_OPTIONS[activeIndex].value));
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <FunnelIcon className="h-4 w-4 text-gray-400" />
      <div ref={rootRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`Status: ${projectStatusSummary(value)}`}
          onClick={() => {
            setActiveIndex(0);
            setOpen((o) => !o);
          }}
          className={cn(
            'border-dark-600 bg-dark-800 flex h-10 min-w-56 items-center justify-between gap-2 rounded-lg border py-2 pr-3 pl-3 text-sm text-white',
            'focus:ring-knowall-green focus:border-transparent focus:ring-2 focus:outline-none'
          )}
        >
          <span className="whitespace-nowrap">{projectStatusSummary(value)}</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-gray-400" />
        </button>
        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Project status"
            aria-activedescendant={`${listId}-${activeIndex}`}
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="border-dark-600 bg-dark-800 absolute z-30 mt-1 w-80 rounded-lg border py-1 shadow-lg focus:outline-none"
          >
            {PROJECT_STATUS_OPTIONS.map((option, i) => {
              const selected = value.includes(option.value);
              return (
                <li
                  key={option.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => onChange(toggleProjectStatus(value, option.value))}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 px-3 py-2',
                    i === activeIndex && 'bg-dark-700'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      selected ? 'border-knowall-green bg-knowall-green' : 'border-dark-500'
                    )}
                  >
                    {selected && <CheckIcon className="h-3 w-3 text-black" strokeWidth={3} />}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm text-white">{option.label}</span>
                    <span className="text-xs text-gray-400">{option.hint}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="relative flex">
        <button
          type="button"
          className="focus:ring-thyme-500 flex cursor-help rounded text-gray-500 hover:text-gray-300 focus:ring-1 focus:outline-none"
          onMouseEnter={() => setInfoOpen(true)}
          onMouseLeave={() => setInfoOpen(false)}
          onFocus={() => setInfoOpen(true)}
          onBlur={() => setInfoOpen(false)}
          aria-label="Info: project statuses"
          aria-describedby={infoOpen ? infoId : undefined}
        >
          <InformationCircleIcon className="h-4 w-4" />
        </button>
        {infoOpen && (
          <div
            id={infoId}
            role="tooltip"
            className="bg-dark-700 absolute top-6 left-0 z-30 w-72 rounded px-3 py-2 text-xs text-gray-300 shadow-lg"
          >
            <div className="font-medium text-white">Where project status comes from</div>
            <ul className="border-dark-500 mt-1 space-y-1 border-t pt-1">
              <li>
                <span className="text-white">Archived</span>: the project is Blocked in Business
                Central (takes priority).
              </li>
              <li>
                <span className="text-white">Completed</span>: Status is Completed and the project
                is not Blocked.
              </li>
              <li>
                <span className="text-white">Active</span>: everything else (Status Open or
                Planning).
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
