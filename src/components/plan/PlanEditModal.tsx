'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { ArrowTopRightOnSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Modal, Button } from '@/components/ui';
import { useCompanyStore } from '@/hooks';
import { bcClient } from '@/services/bc/bcClient';
import { getBCResourceUrl, getBCJobUrl } from '@/utils/bcUrls';
import type { AllocationBlock } from '@/hooks/usePlanStore';
import { format, parseISO, eachDayOfInterval, startOfWeek, endOfWeek, getWeek } from 'date-fns';

interface PlanEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  allocation: AllocationBlock | null;
  onSave: () => void;
  onDelete: () => void;
}

// Track existing BC lines by date (may have multiple per date)
interface ExistingLine {
  id: string;
  etag: string;
  quantity: number;
}

export function PlanEditModal({
  isOpen,
  onClose,
  allocation,
  onSave,
  onDelete,
}: PlanEditModalProps) {
  const { selectedCompany } = useCompanyStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);

  // Track existing lines by date (array because there could be duplicates)
  const [existingLinesByDate, setExistingLinesByDate] = useState<Record<string, ExistingLine[]>>(
    {}
  );
  // Hours input per day (user edits this)
  const [hoursPerDay, setHoursPerDay] = useState<Record<string, string>>({});

  // Calculate the week's days based on allocation start date
  const weekStart = useMemo(() => {
    if (!allocation) return new Date();
    return startOfWeek(parseISO(allocation.startDate), { weekStartsOn: 1 });
  }, [allocation]);

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  // Fetch all existing planning lines for this resource/project/task/week
  const fetchExistingLines = useCallback(async () => {
    if (!allocation) return;

    setIsLoadingExisting(true);
    try {
      const existingLines = await bcClient.getJobPlanningLinesForWeek({
        jobNo: allocation.projectNumber,
        jobTaskNo: allocation.taskNumber || '',
        resourceNo: allocation.resourceNumber,
        weekStart: format(weekStart, 'yyyy-MM-dd'),
        weekEnd: format(weekEnd, 'yyyy-MM-dd'),
      });

      // Group lines by date and aggregate hours for display
      const byDate: Record<string, ExistingLine[]> = {};
      const hours: Record<string, string> = {};

      for (const line of existingLines) {
        const date = line.planningDate;
        if (!byDate[date]) {
          byDate[date] = [];
        }
        byDate[date].push({
          id: line.id,
          etag: line['@odata.etag'] || '',
          quantity: line.quantity,
        });
      }

      // Sum hours for each date for display
      for (const [date, lines] of Object.entries(byDate)) {
        const total = lines.reduce((sum, l) => sum + l.quantity, 0);
        hours[date] = total.toString();
      }

      setExistingLinesByDate(byDate);
      setHoursPerDay(hours);
    } catch (error) {
      console.error('Error fetching existing planning lines:', error);
      // Fall back to empty state
      setExistingLinesByDate({});
      setHoursPerDay({});
    } finally {
      setIsLoadingExisting(false);
    }
  }, [allocation, weekStart, weekEnd]);

  // Fetch existing lines when modal opens
  useEffect(() => {
    if (isOpen && allocation) {
      setExistingLinesByDate({});
      setHoursPerDay({});
      fetchExistingLines();
    }
  }, [isOpen, allocation, fetchExistingLines]);

  // Calculate total hours
  const totalHours = useMemo(() => {
    return Object.values(hoursPerDay).reduce((sum, h) => {
      const val = parseFloat(h);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [hoursPerDay]);

  // Handle changing hours for a day
  const handleHoursChange = (dateKey: string, value: string) => {
    setHoursPerDay((prev) => ({
      ...prev,
      [dateKey]: value,
    }));
  };

  // Delete ALL planning lines for this task in the week
  const handleDelete = async () => {
    if (!allocation || isDeleting) return;

    // Gather all existing lines
    const allLines = Object.values(existingLinesByDate).flat();
    if (allLines.length === 0) {
      toast.error('No planning lines to delete.');
      return;
    }

    const confirmed = window.confirm(
      `Delete all ${allLines.length} planning line(s) for ${allocation.taskName || allocation.projectName} this week?`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      let deleted = 0;
      for (const line of allLines) {
        await bcClient.deleteJobPlanningLine(line.id, line.etag);
        deleted++;
      }
      toast.success(`Deleted ${deleted} planning line(s)`);
      onDelete();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete allocation';
      if (message.includes('not found') || message.includes('not supported')) {
        toast.error(
          'Delete not supported by current BC extension. Please delete in Business Central directly.',
          { duration: 6000 }
        );
      } else {
        toast.error(message);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocation || isSubmitting) return;

    // Validate no entry exceeds 24 hours
    for (const [, hoursStr] of Object.entries(hoursPerDay)) {
      const hours = parseFloat(hoursStr);
      if (!isNaN(hours) && hours > 24) {
        toast.error('Cannot enter more than 24 hours per day.');
        return;
      }
    }

    // Build lists of operations for each day
    const toCreate: { date: string; hours: number }[] = [];
    const toUpdate: { id: string; etag: string; hours: number }[] = [];
    const toDelete: { id: string; etag: string }[] = [];

    for (const day of weekDays) {
      const dateKey = format(day, 'yyyy-MM-dd');
      const newHours = parseFloat(hoursPerDay[dateKey] || '0');
      const existingLines = existingLinesByDate[dateKey] || [];
      const hasHours = !isNaN(newHours) && newHours > 0;

      if (hasHours) {
        if (existingLines.length > 0) {
          // Update first line, delete any extras (consolidate duplicates)
          const [first, ...extras] = existingLines;
          const originalTotal = existingLines.reduce((sum, l) => sum + l.quantity, 0);
          if (newHours !== originalTotal) {
            toUpdate.push({ id: first.id, etag: first.etag, hours: newHours });
          }
          // Delete duplicate lines
          for (const extra of extras) {
            toDelete.push({ id: extra.id, etag: extra.etag });
          }
        } else {
          // Create new line
          toCreate.push({ date: dateKey, hours: newHours });
        }
      } else {
        // No hours for this day - delete all existing lines
        for (const line of existingLines) {
          toDelete.push({ id: line.id, etag: line.etag });
        }
      }
    }

    if (toCreate.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      toast.success('No changes to save.');
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      let created = 0,
        updated = 0,
        deleted = 0;

      // Delete lines first (including duplicates)
      for (const item of toDelete) {
        await bcClient.deleteJobPlanningLine(item.id, item.etag);
        deleted++;
      }

      // Update existing lines with new quantity
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
          jobNo: allocation.projectNumber,
          jobTaskNo: allocation.taskNumber || '',
          resourceNo: allocation.resourceNumber,
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
      const message = error instanceof Error ? error.message : 'Failed to save allocation';
      // Provide user-friendly guidance for common BC validation errors
      if (message.includes('Gen. Prod. Posting Group')) {
        toast.error(
          'Resource is missing "Gen. Prod. Posting Group". Please configure this in the Resource Card in Business Central.',
          { duration: 6000 }
        );
      } else if (message.includes('must have a value')) {
        toast.error(
          `BC validation error: ${message}. Please check the resource/project setup in Business Central.`,
          { duration: 6000 }
        );
      } else if (message.includes('not found') || message.includes('not supported')) {
        toast.error(
          'Update not supported by current BC extension. Please update/delete in Business Central directly.',
          { duration: 6000 }
        );
      } else {
        toast.error(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!allocation) return null;

  const weekNumber = getWeek(weekStart, { weekStartsOn: 1 });
  const weekLabel = `Week ${weekNumber}: ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
  const title = `Edit Allocation`;

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
              {allocation.resourceNumber} - {allocation.resourceName}
            </span>
            <a
              href={getBCResourceUrl(allocation.resourceNumber, selectedCompany?.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dark-400 hover:text-knowall-green ml-2 transition-colors"
              title="Open in Business Central"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Project (read-only with BC link) */}
        <div>
          <label className="text-dark-200 mb-1.5 block text-sm font-medium">Project</label>
          <div className="border-dark-600 bg-dark-700 text-dark-100 flex items-center justify-between rounded border px-3 py-2 text-sm">
            <span>
              {allocation.projectNumber} - {allocation.projectName}
            </span>
            <a
              href={getBCJobUrl(allocation.projectNumber, selectedCompany?.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dark-400 hover:text-knowall-green ml-2 transition-colors"
              title="Open in Business Central"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Task (read-only) */}
        {allocation.taskName && (
          <div>
            <label className="text-dark-200 mb-1.5 block text-sm font-medium">Task</label>
            <div className="border-dark-600 bg-dark-700 text-dark-100 rounded border px-3 py-2 text-sm">
              {allocation.taskName}
            </div>
          </div>
        )}

        {/* Hours per day grid */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-dark-200 text-sm font-medium">Hours per Day</label>
            {isLoadingExisting && <span className="text-dark-400 text-xs">Loading...</span>}
          </div>
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
                    value={hoursPerDay[dateKey] || ''}
                    onChange={(e) => handleHoursChange(dateKey, e.target.value)}
                    min="0"
                    max="24"
                    step="0.5"
                    disabled={isLoadingExisting}
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
        <div className="border-dark-700 flex items-center justify-between border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            isLoading={isDeleting}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <TrashIcon className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} disabled={isLoadingExisting}>
              Save Changes
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
