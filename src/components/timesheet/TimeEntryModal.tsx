'use client';

import { useState, useEffect } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { Modal, Button, Input, Select } from '@/components/ui';
import { useTimeEntriesStore, useProjectsStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import type { TimeEntry, SelectOption } from '@/types';
import { formatDateForDisplay } from '@/utils';

interface TimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string | null;
  entry: TimeEntry | null;
}

export function TimeEntryModal({
  isOpen,
  onClose,
  date,
  entry,
}: TimeEntryModalProps) {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';

  const { addEntry, updateEntry, deleteEntry } = useTimeEntriesStore();
  const { projects, selectedProject, selectedTask, selectProject, selectTask } =
    useProjectsStore();

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (entry) {
        // Editing existing entry
        setProjectId(entry.projectId);
        setTaskId(entry.taskId);
        const h = Math.floor(entry.hours);
        const m = Math.round((entry.hours - h) * 60);
        setHours(h.toString());
        setMinutes(m.toString());
        setNotes(entry.notes || '');
      } else {
        // New entry
        setProjectId(selectedProject?.id || '');
        setTaskId(selectedTask?.id || '');
        setHours('');
        setMinutes('');
        setNotes('');
      }
    }
  }, [isOpen, entry, selectedProject, selectedTask]);

  const projectOptions: SelectOption[] = projects.map((p) => ({
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

    setIsSubmitting(true);
    try {
      if (entry) {
        // Update existing entry
        await updateEntry(entry.id, {
          projectId,
          taskId,
          hours: totalHours,
          notes,
          isBillable: task?.isBillable ?? true,
        });
      } else {
        // Create new entry
        await addEntry({
          projectId,
          taskId,
          userId,
          date,
          hours: totalHours,
          notes,
          isBillable: task?.isBillable ?? true,
          isRunning: false,
        });
      }
      onClose();
    } catch (error) {
      console.error('Failed to save entry:', error);
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
      onClose();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = entry
    ? `Edit time entry for ${date ? formatDateForDisplay(date) : ''}`
    : `New time entry for ${date ? formatDateForDisplay(date) : ''}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Project */}
        <Select
          label="Project"
          options={projectOptions}
          value={projectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          placeholder="Select a project"
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
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Notes (optional)
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-thyme-500 focus:border-transparent"
            placeholder="What did you work on?"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div>
            {entry && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <TrashIcon className="w-4 h-4 mr-2" />
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
