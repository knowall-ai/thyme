'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button, Input, Modal, Select } from '@/components/ui';
import { bcClient } from '@/services/bc';
import { useCompanyPath, useProjectsStore } from '@/hooks';
import { PROJECT_NAME_MAX_LENGTH } from '@/hooks/useProjectDetailsStore';
import { bcErrorText } from '@/utils/projectSourceLinks';
import type { BCCustomer } from '@/types';

export interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Why BC didn't create the project, in plain words */
export function describeCreateProjectError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  // BC refuses with a 403, or a 400 naming the permission the user lacks
  if (/\(403\)/.test(message) || /permission/i.test(message)) {
    return "You don't have permission to create projects in Business Central";
  }
  if (/\(404\)/.test(message)) {
    return 'Creating projects needs the Timmie BC Extension.';
  }
  // Anything else BC rejected (e.g. a blocked customer): show its reason
  return bcErrorText(error, "Business Central didn't create the project. Please try again.");
}

/**
 * Create a project in Business Central, then open it. BC numbers it from the
 * company's number series and decides whether the user may create projects.
 */
export function NewProjectModal({ isOpen, onClose }: NewProjectModalProps) {
  const router = useRouter();
  const toHref = useCompanyPath();
  const fetchProjects = useProjectsStore((state) => state.fetchProjects);

  const [name, setName] = useState('');
  const [customerNo, setCustomerNo] = useState('');
  const [startingDate, setStartingDate] = useState('');
  const [endingDate, setEndingDate] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [customers, setCustomers] = useState<BCCustomer[]>([]);
  const [customersFailed, setCustomersFailed] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Start blank and load the customers each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setCustomerNo('');
    setStartingDate('');
    setEndingDate('');
    setNameTouched(false);
    setError(null);

    let cancelled = false;
    setIsLoadingCustomers(true);
    setCustomersFailed(false);
    bcClient
      .getCustomers()
      .then((list) => {
        if (cancelled) return;
        setCustomers(
          [...list].sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))
        );
      })
      .catch(() => {
        // Internal projects can still be created without the list
        if (!cancelled) setCustomersFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCustomers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const trimmedName = name.trim();
  const nameError = !trimmedName
    ? 'Enter a project name'
    : trimmedName.length > PROJECT_NAME_MAX_LENGTH
      ? `Keep the name to ${PROJECT_NAME_MAX_LENGTH} characters or fewer`
      : null;
  const datesError =
    startingDate && endingDate && endingDate < startingDate
      ? 'The end date must be on or after the start date'
      : null;

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  const handleSubmit = async () => {
    setNameTouched(true);
    if (nameError || datesError || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      const project = await bcClient.createProject({
        displayName: trimmedName,
        billToCustomerNo: customerNo || undefined,
        startingDate: startingDate || undefined,
        endingDate: endingDate || undefined,
      });
      toast.success(`Created ${project.number} ${project.displayName}`);
      // Refresh the list in the background so it's there on the way back
      void fetchProjects();
      onClose();
      router.push(toHref(`/projects/${encodeURIComponent(project.number)}`));
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(describeCreateProjectError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New project" size="sm">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <Input
          id="new-project-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          placeholder="e.g. Website redesign"
          error={nameTouched && nameError ? nameError : undefined}
          disabled={isSaving}
          autoFocus
        />

        <div>
          <Select
            id="new-project-customer"
            label="Customer"
            value={customerNo}
            onChange={(e) => setCustomerNo(e.target.value)}
            disabled={isSaving || isLoadingCustomers}
            options={[
              {
                value: '',
                label: isLoadingCustomers ? 'Loading customers...' : 'No customer (internal)',
              },
              ...customers.map((customer) => ({
                value: customer.number,
                label: `${customer.displayName} (${customer.number})`,
              })),
            ]}
          />
          <p className="text-dark-400 mt-1 text-xs">
            {customersFailed
              ? "Couldn't load customers from Business Central. You can still create an internal project."
              : 'Who the project is billed to. Leave it blank for internal work.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="new-project-start"
            label="Start date"
            type="date"
            value={startingDate}
            onChange={(e) => setStartingDate(e.target.value)}
            disabled={isSaving}
          />
          <Input
            id="new-project-end"
            label="End date"
            type="date"
            value={endingDate}
            min={startingDate || undefined}
            onChange={(e) => setEndingDate(e.target.value)}
            disabled={isSaving}
            error={datesError ?? undefined}
          />
        </div>

        <p className="text-dark-400 text-xs">
          Business Central gives the project its number. Add its tasks in Business Central before
          logging time to it.
        </p>

        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Creating...' : 'Create project'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
