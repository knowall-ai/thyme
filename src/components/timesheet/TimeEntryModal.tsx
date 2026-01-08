'use client';

import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Modal, Button, Input, Select } from '@/components/ui';
import { useTimeEntriesStore, useProjectsStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { bcClient } from '@/services/bc/bcClient';
import type { TimeEntry, SelectOption } from '@/types';
import { formatDateForDisplay } from '@/utils';

interface TimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string | null;
  entry: TimeEntry | null;
}

export function TimeEntryModal({ isOpen, onClose, date, entry }: TimeEntryModalProps) {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';

  const { addEntry, updateEntry, deleteEntry } = useTimeEntriesStore();
  const { projects, selectedProject, selectedTask, selectProject, selectTask } = useProjectsStore();

  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);

  // Check if BC extension is installed
  useEffect(() => {
    if (isOpen) {
      bcClient.isExtensionInstalled().then(setExtensionInstalled);
    }
  }, [isOpen]);

  // Get unique customers from projects
  const customerOptions: SelectOption[] = useMemo(() => {
    const customers = new Map<string, string>();
    projects.forEach((p) => {
      const customerName = p.customerName || 'Unknown';
      if (!customers.has(customerName)) {
        customers.set(customerName, customerName);
      }
    });
    return Array.from(customers.keys())
      .sort()
      .map((name) => ({ value: name, label: name }));
  }, [projects]);

  // Check if we should show customer dropdown (hide if only one customer or all "Unknown")
  const showCustomerDropdown =
    customerOptions.length > 1 ||
    (customerOptions.length === 1 && customerOptions[0].value !== 'Unknown');

  // Filter projects by selected customer (or show all if customer dropdown is hidden)
  const filteredProjects = useMemo(() => {
    if (!showCustomerDropdown) return projects;
    if (!customerId) return [];
    return projects.filter((p) => (p.customerName || 'Unknown') === customerId);
  }, [projects, customerId, showCustomerDropdown]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (entry) {
        // Editing existing entry - entry.projectId is a job code (e.g., "PR00030"), not a GUID
        const project = projects.find((p) => p.code === entry.projectId);
        setCustomerId(project?.customerName || 'Unknown');
        // Use project.id (GUID) for form state since dropdown options use GUIDs
        setProjectId(project?.id || '');
        // Find task by code and use its id
        const task = project?.tasks.find((t) => t.code === entry.taskId);
        setTaskId(task?.id || '');
        const h = Math.floor(entry.hours);
        const m = Math.round((entry.hours - h) * 60);
        setHours(h.toString());
        setMinutes(m.toString());
        setNotes(entry.notes || '');
      } else {
        // New entry
        const customerName = selectedProject?.customerName || 'Unknown';
        setCustomerId(customerName);
        setProjectId(selectedProject?.id || '');
        setTaskId(selectedTask?.id || '');
        setHours('');
        setMinutes('');
        setNotes('');
      }
    }
  }, [isOpen, entry, selectedProject, selectedTask, projects]);

  const projectOptions: SelectOption[] = filteredProjects.map((p) => ({
    value: p.id,
    label: `${p.code} - ${p.name}`,
  }));

  const taskOptions: SelectOption[] =
    projects
      .find((p) => p.id === projectId)
      ?.tasks.map((t) => ({
        value: t.id,
        label: t.name,
      })) || [];

  const handleCustomerChange = (value: string) => {
    setCustomerId(value);
    setProjectId('');
    setTaskId('');
    selectProject(null);
    selectTask(null);
  };

  const handleProjectChange = (value: string) => {
    setProjectId(value);
    setTaskId('');
    const project = projects.find((p) => p.id === value);
    selectProject(project || null);
  };

  const handleTaskChange = (value: string) => {
    setTaskId(value);
    const project = projects.find((p) => p.id === projectId);
    const task = project?.tasks.find((t) => t.id === value);
    selectTask(task || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !projectId || !taskId || isSubmitting) return;

    const totalHours = (parseInt(hours) || 0) + (parseInt(minutes) || 0) / 60;
    if (totalHours <= 0) return;

    const project = projects.find((p) => p.id === projectId);
    const task = project?.tasks.find((t) => t.id === taskId);

    if (!project || !task) {
      toast.error('Please select a valid project and task.');
      return;
    }

    // Use project.code and task.code for BC API (job numbers, not GUIDs)
    const jobNo = project.code;
    const jobTaskNo = task.code;

    setIsSubmitting(true);
    try {
      if (entry) {
        // Update existing entry
        await updateEntry(entry.id, {
          projectId: jobNo,
          taskId: jobTaskNo,
          hours: totalHours,
          notes,
          isBillable: task?.isBillable ?? true,
        });
      } else {
        // Create new entry
        await addEntry({
          projectId: jobNo,
          taskId: jobTaskNo,
          userId,
          date,
          hours: totalHours,
          notes,
          isBillable: task?.isBillable ?? true,
          isRunning: false,
        });
      }
      toast.success(entry ? 'Time entry updated' : 'Time entry saved');
      onClose();
    } catch {
      toast.error('Failed to save time entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!entry || isSubmitting) return;

    if (!window.confirm('Are you sure you want to delete this entry?')) {
      return;
    }

    setIsSubmitting(true);
    try {
      await deleteEntry(entry.id);
      toast.success('Time entry deleted');
      onClose();
    } catch {
      toast.error('Failed to delete time entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = entry
    ? `Edit time entry for ${date ? formatDateForDisplay(date) : ''}`
    : `New time entry for ${date ? formatDateForDisplay(date) : ''}`;

  // Show extension required message if not installed
  if (extensionInstalled === false) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="mb-4 rounded-full bg-amber-500/10 p-3">
            <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-white">Extension Required</h3>
          <p className="mb-4 max-w-sm text-sm text-dark-300">
            The Thyme BC Extension is required to log time entries. It provides the project tasks
            needed by Business Central.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                window.open('https://github.com/knowall-ai/thyme-bc-extension', '_blank')
              }
            >
              Learn More
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer - only show if multiple customers exist */}
        {showCustomerDropdown && (
          <Select
            label="Customer"
            options={customerOptions}
            value={customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            placeholder="Select a customer"
            required
          />
        )}

        {/* Project */}
        <Select
          label="Project"
          options={projectOptions}
          value={projectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          placeholder="Select a project"
          disabled={showCustomerDropdown && !customerId}
          required
        />

        {/* Task */}
        <Select
          label="Task"
          options={taskOptions}
          value={taskId}
          onChange={(e) => handleTaskChange(e.target.value)}
          placeholder="Select a task"
          disabled={!projectId || taskOptions.length === 0}
          required
        />

        {/* Duration */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Hours"
            type="number"
            min="0"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="0"
          />
          <Input
            label="Minutes"
            type="number"
            min="0"
            max="59"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="0"
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-dark-200">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-dark-100 placeholder:text-dark-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-thyme-500"
            placeholder="What did you work on?"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-dark-700 pt-4">
          <div>
            {entry && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {entry ? 'Update' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
