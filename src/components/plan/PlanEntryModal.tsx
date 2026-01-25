'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { ExclamationTriangleIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Modal, Button, Select } from '@/components/ui';
import { useProjectsStore, useCompanyStore } from '@/hooks';
import { bcClient } from '@/services/bc/bcClient';
import { getBCResourceUrl, getBCJobUrl } from '@/utils/bcUrls';
import type { SelectOption, BCJobPlanningLine } from '@/types';
import { format, getWeek, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

interface PlanEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceNumber: string;
  resourceName: string;
  selectedDate: Date;
  onSave: () => void;
  preSelectedProjectCode?: string;
  preSelectedTaskCode?: string;
}

export function PlanEntryModal({
  isOpen,
  onClose,
  resourceNumber,
  resourceName,
  selectedDate,
  onSave,
  preSelectedProjectCode,
  preSelectedTaskCode,
}: PlanEntryModalProps) {
  const { projects, fetchProjects } = useProjectsStore();
  const { selectedCompany } = useCompanyStore();

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [dayHours, setDayHours] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  // Track existing planning lines by date -> { id, etag } for update/delete
  const [existingLinesByDate, setExistingLinesByDate] = useState<
    Record<string, { id: string; etag: string }>
  >({});
  const [hasExistingData, setHasExistingData] = useState(false);

  // Calculate the week's days based on selected date
  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const weekEnd = useMemo(() => endOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  // Check if BC extension is installed
  useEffect(() => {
    if (isOpen) {
      bcClient.isExtensionInstalled().then(setExtensionInstalled);
    }
  }, [isOpen]);

  // Fetch projects when modal opens
  useEffect(() => {
    if (isOpen && projects.length === 0) {
      fetchProjects();
    }
  }, [isOpen, projects.length, fetchProjects]);

  // Reset form when modal opens - with pre-selection support
  useEffect(() => {
    if (isOpen) {
      // Find project by code if pre-selected
      if (preSelectedProjectCode) {
        const project = projects.find((p) => p.code === preSelectedProjectCode);
        if (project) {
          setProjectId(project.id);
          // Find task by code if pre-selected
          if (preSelectedTaskCode && project.tasks) {
            const task = project.tasks.find((t) => t.code === preSelectedTaskCode);
            setTaskId(task?.id || '');
          } else {
            setTaskId('');
          }
        } else {
          setProjectId('');
          setTaskId('');
        }
      } else {
        setProjectId('');
        setTaskId('');
      }
      setExistingLinesByDate({});
      setHasExistingData(false);
      // Initialize day hours with empty strings
      const initialHours: Record<string, string> = {};
      weekDays.forEach((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        initialHours[dateKey] = '';
      });
      setDayHours(initialHours);
    }
  }, [isOpen, weekDays, preSelectedProjectCode, preSelectedTaskCode, projects]);

  // Fetch existing planning lines when task is selected
  const fetchExistingLines = useCallback(async () => {
    if (!projectId || !taskId) return;

    const project = projects.find((p) => p.id === projectId);
    const task = project?.tasks?.find((t) => t.id === taskId);
    if (!project || !task) return;

    setIsLoadingExisting(true);
    try {
      const existingLines = await bcClient.getJobPlanningLinesForWeek({
        jobNo: project.code,
        jobTaskNo: task.code,
        resourceNo: resourceNumber,
        weekStart: format(weekStart, 'yyyy-MM-dd'),
        weekEnd: format(weekEnd, 'yyyy-MM-dd'),
      });

      if (existingLines.length > 0) {
        // Pre-populate hours from existing lines
        const newHours: Record<string, string> = {};
        const newLinesByDate: Record<string, { id: string; etag: string }> = {};

        // Initialize with empty
        weekDays.forEach((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          newHours[dateKey] = '';
        });

        // Fill in existing values
        for (const line of existingLines) {
          const dateKey = line.planningDate;
          // If there are multiple lines for the same day, sum them
          const existingVal = parseFloat(newHours[dateKey] || '0');
          newHours[dateKey] = (existingVal + line.quantity).toString();
          // Track id and etag for updates (last one wins if multiple)
          newLinesByDate[dateKey] = { id: line.id, etag: line['@odata.etag'] || '' };
        }

        setDayHours(newHours);
        setExistingLinesByDate(newLinesByDate);
        setHasExistingData(true);
      } else {
        // Reset to empty if no existing lines
        const initialHours: Record<string, string> = {};
        weekDays.forEach((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          initialHours[dateKey] = '';
        });
        setDayHours(initialHours);
        setExistingLinesByDate({});
        setHasExistingData(false);
      }
    } catch (error) {
      console.error('Error fetching existing planning lines:', error);
    } finally {
      setIsLoadingExisting(false);
    }
  }, [projectId, taskId, projects, resourceNumber, weekStart, weekEnd, weekDays]);

  // Trigger fetch when task changes
  useEffect(() => {
    if (taskId) {
      fetchExistingLines();
    }
  }, [taskId, fetchExistingLines]);

  // Project options
  const projectOptions: SelectOption[] = useMemo(
    () =>
      projects.map((p) => ({
        value: p.id,
        label: `${p.code} - ${p.name}`,
      })),
    [projects]
  );

  // Task options based on selected project
  const taskOptions: SelectOption[] = useMemo(() => {
    const project = projects.find((p) => p.id === projectId);
    return (
      project?.tasks?.map((t) => ({
        value: t.id,
        label: t.name,
      })) || []
    );
  }, [projects, projectId]);

  // Calculate total hours
  const totalHours = useMemo(() => {
    return Object.values(dayHours).reduce((sum, h) => {
      const val = parseFloat(h);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [dayHours]);

  const handleProjectChange = (value: string) => {
    setProjectId(value);
    setTaskId('');
  };

  const handleDayHoursChange = (dateKey: string, value: string) => {
    setDayHours((prev) => ({
      ...prev,
      [dateKey]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !taskId || isSubmitting) return;

    const project = projects.find((p) => p.id === projectId);
    const task = project?.tasks?.find((t) => t.id === taskId);

    if (!project || !task) {
      toast.error('Please select a valid project and task.');
      return;
    }

    // Categorize days into create, update, delete
    const toCreate: { date: string; hours: number }[] = [];
    const toUpdate: { date: string; hours: number; id: string; etag: string }[] = [];
    const toDelete: { date: string; id: string; etag: string }[] = [];

    for (const [date, hoursStr] of Object.entries(dayHours)) {
      const hours = parseFloat(hoursStr);
      const hasHours = !isNaN(hours) && hours > 0;
      const existing = existingLinesByDate[date];

      if (hasHours && existing) {
        // Update existing line
        toUpdate.push({ date, hours, id: existing.id, etag: existing.etag });
      } else if (hasHours && !existing) {
        // Create new line
        toCreate.push({ date, hours });
      } else if (!hasHours && existing) {
        // Delete existing line (hours cleared)
        toDelete.push({ date, id: existing.id, etag: existing.etag });
      }
      // If no hours and no existing line, nothing to do
    }

    if (toCreate.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      toast.error('Please enter hours for at least one day.');
      return;
    }

    // Validate no day exceeds 24 hours
    for (const [date, hoursStr] of Object.entries(dayHours)) {
      const hours = parseFloat(hoursStr);
      if (!isNaN(hours) && hours > 24) {
        toast.error(`Cannot enter more than 24 hours per day.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let created = 0,
        updated = 0,
        deleted = 0;

      // Delete lines where hours were cleared
      for (const item of toDelete) {
        await bcClient.deleteJobPlanningLine(item.id, item.etag);
        deleted++;
      }

      // Update existing lines
      for (const item of toUpdate) {
        await bcClient.updateJobPlanningLine(
          item.id,
          {
            quantity: item.hours,
          },
          item.etag
        );
        updated++;
      }

      // Create new lines
      for (const item of toCreate) {
        await bcClient.createJobPlanningLine({
          jobNo: project.code,
          jobTaskNo: task.code,
          resourceNo: resourceNumber,
          planningDate: item.date,
          quantity: item.hours,
        });
        created++;
      }

      // Build success message
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} created`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (deleted > 0) parts.push(`${deleted} deleted`);
      toast.success(`Planning lines: ${parts.join(', ')}`);

      onSave();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save planning lines';
      // Provide user-friendly guidance for common BC validation errors
      if (message.includes('Gen. Prod. Posting Group')) {
        toast.error(
          'Resource is missing "Gen. Prod. Posting Group". Please configure this in the Resource Card in Business Central.',
          { duration: 6000 }
        );
      } else if (message.includes('must have a value')) {
        toast.error(
          `BC validation error: ${message}. Please check the resource/project setup in Business Central.`,
          {
            duration: 6000,
          }
        );
      } else {
        toast.error(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const weekNumber = getWeek(weekStart, { weekStartsOn: 1 });
  const weekLabel = `Week ${weekNumber}: ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
  const title = `Add Plan for ${resourceName}`;

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

        {/* Resource (read-only with BC link) */}
        <div>
          <label className="text-dark-200 mb-1.5 block text-sm font-medium">Resource</label>
          <div className="border-dark-600 bg-dark-700 text-dark-100 flex items-center justify-between rounded border px-3 py-2 text-sm">
            <span>
              {resourceNumber} - {resourceName}
            </span>
            <a
              href={getBCResourceUrl(resourceNumber, selectedCompany?.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dark-400 hover:text-knowall-green ml-2 transition-colors"
              title="Open in Business Central"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Project */}
        <div>
          <label className="text-dark-200 mb-1.5 block text-sm font-medium">Project</label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Select
                options={projectOptions}
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                placeholder="Select a project"
                required
              />
            </div>
            {projectId && (
              <a
                href={getBCJobUrl(
                  projects.find((p) => p.id === projectId)?.code || '',
                  selectedCompany?.name
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="text-dark-400 hover:text-knowall-green transition-colors"
                title="Open in Business Central"
              >
                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
              </a>
            )}
          </div>
        </div>

        {/* Task */}
        <Select
          label="Task"
          options={taskOptions}
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          placeholder="Select a task"
          disabled={!projectId || taskOptions.length === 0}
          required
        />

        {/* Hours per day */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-dark-200 text-sm font-medium">Hours per Day</label>
            {isLoadingExisting && (
              <span className="text-dark-400 text-xs">Loading existing...</span>
            )}
            {!isLoadingExisting && hasExistingData && (
              <span className="text-knowall-green text-xs">Editing existing allocation</span>
            )}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const hasExistingLine = !!existingLinesByDate[dateKey];
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
                    disabled={isLoadingExisting}
                    className={`border-dark-600 bg-dark-700 text-dark-100 focus:ring-knowall-green h-8 w-full [appearance:textfield] rounded border px-1 text-right text-sm focus:ring-1 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${hasExistingLine ? 'border-knowall-green/50' : ''}`}
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
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={!projectId || !taskId || isLoadingExisting}
          >
            {hasExistingData ? 'Save Changes' : 'Add Plan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
