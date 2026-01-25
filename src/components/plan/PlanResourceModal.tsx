'use client';

import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Modal, Button, Select } from '@/components/ui';
import { useProjectsStore } from '@/hooks';
import { bcClient } from '@/services/bc/bcClient';
import type { SelectOption, BCResource } from '@/types';
import { format, getWeek, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

interface PlanResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectNumber: string;
  projectName: string;
  selectedDate: Date;
  onSave: () => void;
}

export function PlanResourceModal({
  isOpen,
  onClose,
  projectNumber,
  projectName,
  selectedDate,
  onSave,
}: PlanResourceModalProps) {
  const { projects, fetchProjects } = useProjectsStore();

  const [resources, setResources] = useState<BCResource[]>([]);
  const [resourceId, setResourceId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [dayHours, setDayHours] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);

  // Calculate the week's days based on selected date
  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const weekEnd = useMemo(() => endOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  // Get the current project from projects store
  const currentProject = useMemo(
    () => projects.find((p) => p.code === projectNumber),
    [projects, projectNumber]
  );

  // Check if BC extension is installed
  useEffect(() => {
    if (isOpen) {
      bcClient.isExtensionInstalled().then(setExtensionInstalled);
    }
  }, [isOpen]);

  // Fetch resources and projects when modal opens
  useEffect(() => {
    if (isOpen) {
      // Fetch resources
      setIsLoadingResources(true);
      bcClient
        .getResources()
        .then(setResources)
        .catch(() => toast.error('Failed to load resources'))
        .finally(() => setIsLoadingResources(false));

      // Fetch projects if not already loaded (for tasks)
      if (projects.length === 0) {
        fetchProjects();
      }
    }
  }, [isOpen, projects.length, fetchProjects]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setResourceId('');
      setTaskId('');
      // Initialize day hours with empty strings
      const initialHours: Record<string, string> = {};
      weekDays.forEach((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        initialHours[dateKey] = '';
      });
      setDayHours(initialHours);
    }
  }, [isOpen, weekDays]);

  // Resource options
  const resourceOptions: SelectOption[] = useMemo(
    () =>
      resources.map((r) => ({
        value: r.number,
        label: `${r.number} - ${r.name || r.displayName || r.number}`,
      })),
    [resources]
  );

  // Task options based on the project
  const taskOptions: SelectOption[] = useMemo(() => {
    return (
      currentProject?.tasks?.map((t) => ({
        value: t.id,
        label: t.name,
      })) || []
    );
  }, [currentProject]);

  // Calculate total hours
  const totalHours = useMemo(() => {
    return Object.values(dayHours).reduce((sum, h) => {
      const val = parseFloat(h);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [dayHours]);

  const handleDayHoursChange = (dateKey: string, value: string) => {
    setDayHours((prev) => ({
      ...prev,
      [dateKey]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceId || !taskId || isSubmitting) return;

    const task = currentProject?.tasks?.find((t) => t.id === taskId);

    if (!task) {
      toast.error('Please select a valid task.');
      return;
    }

    // Get days with hours to create
    const daysToCreate = Object.entries(dayHours)
      .filter(([, hours]) => {
        const val = parseFloat(hours);
        return !isNaN(val) && val > 0;
      })
      .map(([date, hours]) => ({
        date,
        hours: parseFloat(hours),
      }));

    if (daysToCreate.length === 0) {
      toast.error('Please enter hours for at least one day.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create Job Planning Lines for each day
      // Note: This requires BC extension support for creating planning lines
      // For now, show a message that this feature requires extension update
      toast.error('Creating planning lines requires BC extension update. Coming soon!');

      // TODO: Implement when BC extension supports creating Job Planning Lines
      // for (const day of daysToCreate) {
      //   await bcClient.createJobPlanningLine({
      //     jobNo: projectNumber,
      //     jobTaskNo: task.code,
      //     resourceNo: resourceId,
      //     planningDate: day.date,
      //     quantity: day.hours,
      //   });
      // }
      // toast.success(`Created ${daysToCreate.length} planning line(s)`);
      // onSave();
      // onClose();
    } catch {
      toast.error('Failed to create planning lines. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const weekNumber = getWeek(weekStart, { weekStartsOn: 1 });
  const weekLabel = `Week ${weekNumber}: ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
  const title = `Add Resource to ${projectName}`;

  // Show extension required message if not installed
  if (extensionInstalled === false) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="mb-4 rounded-full bg-amber-500/10 p-3">
            <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-white">Extension Required</h3>
          <p className="text-dark-300 mb-4 max-w-sm text-sm">
            The Thyme BC Extension is required to create planning lines. It provides the project
            tasks needed by Business Central.
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
        {/* Week info */}
        <div className="text-dark-400 text-sm">
          Week: <span className="text-dark-200 font-medium">{weekLabel}</span>
        </div>

        {/* Resource */}
        <Select
          label="Resource"
          options={resourceOptions}
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          placeholder={isLoadingResources ? 'Loading resources...' : 'Select a resource'}
          disabled={isLoadingResources}
          required
        />

        {/* Task */}
        <Select
          label="Task"
          options={taskOptions}
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          placeholder="Select a task"
          disabled={taskOptions.length === 0}
          required
        />

        {/* Hours per day */}
        <div>
          <label className="text-dark-200 mb-2 block text-sm font-medium">Hours per Day</label>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div key={dateKey} className="flex flex-col items-center">
                  <span className={`mb-1 text-xs ${isWeekend ? 'text-dark-500' : 'text-dark-400'}`}>
                    {format(day, 'EEE')}
                  </span>
                  <span
                    className={`mb-1 text-xs font-medium ${isWeekend ? 'text-dark-500' : 'text-dark-300'}`}
                  >
                    {format(day, 'd')}
                  </span>
                  <input
                    type="number"
                    value={dayHours[dateKey] || ''}
                    onChange={(e) => handleDayHoursChange(dateKey, e.target.value)}
                    min="0"
                    max="24"
                    step="0.5"
                    className="border-dark-600 bg-dark-700 text-dark-100 focus:ring-knowall-green h-8 w-full [appearance:textfield] rounded border px-1 text-right text-sm focus:ring-1 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder="0"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Total */}
        <div className="text-dark-300 border-dark-700 flex items-center justify-between border-t pt-3 text-sm">
          <span>Total Hours</span>
          <span className="text-dark-100 font-medium">{totalHours.toFixed(1)}h</span>
        </div>

        {/* Actions */}
        <div className="border-dark-700 flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!resourceId || !taskId}>
            Add Plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
