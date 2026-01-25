'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  CheckIcon,
  DocumentPlusIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
  FolderIcon,
  UserGroupIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import { Card, Button, WeekNavigation, ExtensionNotInstalled, Select } from '@/components/ui';
import { usePlanStore, useProjectsStore } from '@/hooks';
import { useCompanyStore } from '@/hooks';
import { useAuth, getUserProfilePhoto } from '@/services/auth';
import { ExtensionNotInstalledError } from '@/services/bc';
import { cn } from '@/utils';
import type { AllocationBlock, PlanTeamMember, PlanProject, ViewMode } from '@/hooks/usePlanStore';
import {
  addWeeks,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  format,
  isSameDay,
  isToday,
} from 'date-fns';

// Allocation Block Component
interface AllocationBlockProps {
  allocation: AllocationBlock;
  days: Date[];
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dayWidth: number;
}

function AllocationBlockComponent({
  allocation,
  days,
  isSelected,
  onSelect,
  onDragStart,
  onDragEnd,
  dayWidth,
}: AllocationBlockProps) {
  const startDate = new Date(allocation.startDate);
  const endDate = new Date(allocation.endDate);

  // Find the day index where allocation starts and ends
  const startIndex = days.findIndex((d) => isSameDay(d, startDate));
  const endIndex = days.findIndex((d) => isSameDay(d, endDate));

  // If allocation is outside visible range, don't render
  if (startIndex === -1 && endIndex === -1) {
    // Check if allocation spans the entire visible range
    const allocStart = startDate.getTime();
    const allocEnd = endDate.getTime();
    const visibleStart = days[0].getTime();
    const visibleEnd = days[days.length - 1].getTime();

    if (allocEnd < visibleStart || allocStart > visibleEnd) {
      return null;
    }
  }

  // Calculate position and width
  const effectiveStartIndex = startIndex === -1 ? 0 : startIndex;
  const effectiveEndIndex = endIndex === -1 ? days.length - 1 : endIndex;
  const left = effectiveStartIndex * dayWidth;
  const width = (effectiveEndIndex - effectiveStartIndex + 1) * dayWidth - 4; // -4 for margins

  return (
    <div
      className={cn(
        'absolute top-1 h-8 cursor-pointer rounded px-2 text-xs font-medium text-white shadow transition-all',
        isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-transparent'
      )}
      style={{
        left: `${left + 2}px`,
        width: `${width}px`,
        backgroundColor: allocation.color,
      }}
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', allocation.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title={`${allocation.projectName}${allocation.taskName ? ` - ${allocation.taskName}` : ''}\n${allocation.totalHours.toFixed(1)}h total`}
    >
      <div className="flex h-full items-center justify-between overflow-hidden">
        <span className="truncate">
          {allocation.projectName}
          {allocation.taskName && <span className="opacity-70"> - {allocation.taskName}</span>}
        </span>
        <span className="ml-1 shrink-0 opacity-80">{allocation.totalHours.toFixed(1)}h</span>
      </div>
    </div>
  );
}

// Resource Row Component
interface ResourceRowProps {
  member: PlanTeamMember;
  days: Date[];
  isSelected: boolean;
  onToggleSelect: () => void;
  selectedAllocationId: string | null;
  onSelectAllocation: (id: string | null) => void;
  onDragStart: (allocation: AllocationBlock) => void;
  onDragEnd: () => void;
  onDrop: (date: string) => void;
  isDragging: boolean;
  dayWidth: number;
  showAssignButton: boolean;
  onAssign: () => void;
}

function ResourceRow({
  member,
  days,
  isSelected,
  onToggleSelect,
  selectedAllocationId,
  onSelectAllocation,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging,
  dayWidth,
  showAssignButton,
  onAssign,
}: ResourceRowProps) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    onDrop(format(day, 'yyyy-MM-dd'));
  };

  return (
    <div
      className={cn(
        'border-dark-700 hover:bg-dark-800/50 flex items-center border-b transition-colors',
        isSelected && 'bg-knowall-green/5'
      )}
    >
      {/* Checkbox */}
      <div className="flex w-10 shrink-0 items-center justify-center px-2">
        <button
          onClick={onToggleSelect}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded border transition-colors',
            isSelected
              ? 'border-knowall-green bg-knowall-green text-dark-950'
              : 'border-dark-500 hover:border-dark-400'
          )}
          aria-label={isSelected ? `Deselect ${member.name}` : `Select ${member.name}`}
        >
          {isSelected && <CheckIcon className="h-3 w-3" />}
        </button>
      </div>

      {/* Avatar and Name */}
      <div className="flex min-w-[180px] items-center gap-3 py-2 pr-4">
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={member.name}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium',
              member.timesheetStatus === 'No Timesheet'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-dark-600 text-dark-200'
            )}
            title={
              member.timesheetStatus === 'No Timesheet' ? 'No timesheet for this week' : undefined
            }
          >
            {member.timesheetStatus === 'No Timesheet' ? '?' : initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-dark-100 truncate text-sm font-medium">{member.name}</p>
        </div>
        {showAssignButton && (
          <Button variant="ghost" size="sm" onClick={onAssign} className="h-6 px-2 text-xs">
            <PlusIcon className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Calendar Grid with Allocations */}
      <div className="relative flex flex-1" style={{ minHeight: '40px' }}>
        {/* Day cells */}
        {days.map((day, index) => {
          const dayIsToday = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'border-dark-700 h-10 border-l',
                dayIsToday && 'bg-knowall-green/5',
                isDragging && 'hover:bg-dark-700/50'
              )}
              style={{ width: `${dayWidth}px` }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
            />
          );
        })}

        {/* Allocation blocks */}
        {member.allocations.map((allocation) => (
          <AllocationBlockComponent
            key={allocation.id}
            allocation={allocation}
            days={days}
            isSelected={selectedAllocationId === allocation.id}
            onSelect={() => onSelectAllocation(allocation.id)}
            onDragStart={() => onDragStart(allocation)}
            onDragEnd={onDragEnd}
            dayWidth={dayWidth}
          />
        ))}
      </div>

      {/* Total Hours */}
      <div className="text-dark-300 w-16 shrink-0 px-2 text-right text-sm">
        {member.totalHours > 0 ? `${member.totalHours.toFixed(1)}h` : '-'}
      </div>
    </div>
  );
}

// Project Row Component (for Projects view)
interface ProjectRowProps {
  project: PlanProject;
  days: Date[];
  selectedAllocationId: string | null;
  onSelectAllocation: (id: string | null) => void;
  onDragStart: (allocation: AllocationBlock) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  dayWidth: number;
}

function ProjectRow({
  project,
  days,
  selectedAllocationId,
  onSelectAllocation,
  onDragStart,
  onDragEnd,
  isDragging,
  dayWidth,
}: ProjectRowProps) {
  // Group allocations by resource
  const allocationsByResource = useMemo(() => {
    const map = new Map<string, AllocationBlock[]>();
    for (const allocation of project.allocations) {
      const key = allocation.resourceNumber;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(allocation);
    }
    return map;
  }, [project.allocations]);

  return (
    <div className="border-dark-700 border-b">
      {/* Project Header */}
      <div className="bg-dark-800/30 border-dark-700 flex items-center border-b px-4 py-2">
        <div className="mr-3 h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="text-dark-100 font-medium">{project.name}</span>
        <span className="text-dark-400 ml-2 text-sm">({project.number})</span>
        <span className="text-dark-300 ml-auto text-sm">{project.totalHours.toFixed(1)}h</span>
      </div>

      {/* Resources under this project */}
      {Array.from(allocationsByResource.entries()).map(([resourceNumber, allocations]) => (
        <div key={resourceNumber} className="hover:bg-dark-800/30 flex items-center">
          <div className="text-dark-300 w-[190px] shrink-0 py-2 pr-4 pl-10 text-sm">
            {allocations[0].resourceName}
          </div>
          <div className="relative flex flex-1" style={{ minHeight: '40px' }}>
            {days.map((day) => {
              const dayIsToday = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-dark-700 h-10 border-l',
                    dayIsToday && 'bg-knowall-green/5'
                  )}
                  style={{ width: `${dayWidth}px` }}
                />
              );
            })}
            {allocations.map((allocation) => (
              <AllocationBlockComponent
                key={allocation.id}
                allocation={allocation}
                days={days}
                isSelected={selectedAllocationId === allocation.id}
                onSelect={() => onSelectAllocation(allocation.id)}
                onDragStart={() => onDragStart(allocation)}
                onDragEnd={onDragEnd}
                dayWidth={dayWidth}
              />
            ))}
          </div>
          <div className="text-dark-300 w-16 shrink-0 px-2 text-right text-sm">
            {allocations.reduce((sum, a) => sum + a.totalHours, 0).toFixed(1)}h
          </div>
        </div>
      ))}
    </div>
  );
}

// Assign to Project Modal
interface AssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceName: string;
  resourceNumber: string;
  onAssign: (projectNumber: string, taskNumber: string, hours: number) => void;
}

function AssignModal({
  isOpen,
  onClose,
  resourceName,
  resourceNumber,
  onAssign,
}: AssignModalProps) {
  const { projects, fetchProjects } = useProjectsStore();
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [hours, setHours] = useState('8');

  useEffect(() => {
    if (isOpen && projects.length === 0) {
      fetchProjects();
    }
  }, [isOpen, projects.length, fetchProjects]);

  if (!isOpen) return null;

  const projectOptions = projects.map((p) => ({
    value: p.code,
    label: `${p.code} - ${p.name}`,
  }));

  const selectedProjectData = projects.find((p) => p.code === selectedProject);
  const taskOptions =
    selectedProjectData?.tasks?.map((t) => ({
      value: t.code,
      label: `${t.code} - ${t.name}`,
    })) || [];

  const handleSubmit = () => {
    if (!selectedProject || !selectedTask || !hours) return;

    const parsedHours = parseFloat(hours);
    if (isNaN(parsedHours) || parsedHours < 0.5 || parsedHours > 24) {
      return;
    }

    onAssign(selectedProject, selectedTask, parsedHours);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-modal-title"
    >
      <div className="bg-dark-800 border-dark-700 w-full max-w-md rounded-xl border p-6 shadow-xl">
        <h3 id="assign-modal-title" className="mb-4 text-lg font-semibold text-white">
          Assign {resourceName} to Task
        </h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="assign-project" className="text-dark-300 mb-1 block text-sm">
              Project
            </label>
            <Select
              id="assign-project"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              options={projectOptions}
              placeholder="Select a project..."
            />
          </div>

          {selectedProject && (
            <div>
              <label htmlFor="assign-task" className="text-dark-300 mb-1 block text-sm">
                Task
              </label>
              <Select
                id="assign-task"
                value={selectedTask}
                onChange={(e) => setSelectedTask(e.target.value)}
                options={taskOptions}
                placeholder="Select a task..."
              />
            </div>
          )}

          <div>
            <label htmlFor="assign-hours" className="text-dark-300 mb-1 block text-sm">
              Hours per day
            </label>
            <input
              id="assign-hours"
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              min="0.5"
              max="24"
              step="0.5"
              className="border-dark-600 bg-dark-700 text-dark-100 w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedProject || !selectedTask || !hours}
          >
            Assign
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PlanPanel() {
  const { selectedCompany } = useCompanyStore();
  const { account } = useAuth();
  const userEmail = account?.username || '';
  const emailDomain = userEmail ? userEmail.split('@')[1] : undefined;

  const {
    teamMembers,
    projects,
    viewMode,
    isLoading,
    isCreatingTimesheets,
    error,
    selectedMemberIds,
    selectedAllocationId,
    isDragging,
    fetchTeamData,
    setCurrentWeekStart,
    setViewMode,
    toggleMemberSelection,
    selectAllWithoutTimesheet,
    clearSelection,
    createTimesheetsForSelected,
    updateMemberPhoto,
    selectAllocation,
    startDrag,
    endDrag,
    dropAllocation,
    createAllocation,
  } = usePlanStore();

  const [currentWeekStart, setLocalWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [extensionNotInstalled, setExtensionNotInstalled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigningResource, setAssigningResource] = useState<{
    name: string;
    number: string;
  } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(3); // 1-5, where 3 is default

  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom constants
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;
  const ZOOM_DAY_WIDTHS = [20, 35, 50, 70, 100]; // Day width for each zoom level

  // Calculate weeks to show based on fullscreen mode
  const effectiveWeeksToShow = isFullscreen ? 4 : 1;

  // Calculate all days to display
  const allDays = useMemo(() => {
    const endDate = endOfWeek(addWeeks(currentWeekStart, effectiveWeeksToShow - 1), {
      weekStartsOn: 1,
    });
    return eachDayOfInterval({ start: currentWeekStart, end: endDate });
  }, [currentWeekStart, effectiveWeeksToShow]);

  // Calculate day width based on zoom level
  const dayWidth = ZOOM_DAY_WIDTHS[zoomLevel - 1];

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 1, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 1, MIN_ZOOM));
  };

  // Navigation handlers
  const handlePrevious = () => {
    const newDate = addWeeks(currentWeekStart, -1);
    setLocalWeekStart(newDate);
    setCurrentWeekStart(newDate);
  };

  const handleNext = () => {
    const newDate = addWeeks(currentWeekStart, 1);
    setLocalWeekStart(newDate);
    setCurrentWeekStart(newDate);
  };

  const handleToday = () => {
    const today = startOfWeek(new Date(), { weekStartsOn: 1 });
    setLocalWeekStart(today);
    setCurrentWeekStart(today);
  };

  const handleDateSelect = (date: Date) => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    setLocalWeekStart(weekStart);
    setCurrentWeekStart(weekStart);
  };

  // Fetch data when company, week, or weeks to show changes
  useEffect(() => {
    async function loadData() {
      setExtensionNotInstalled(false);
      try {
        await fetchTeamData(currentWeekStart, effectiveWeeksToShow, emailDomain);
      } catch (err) {
        if (err instanceof ExtensionNotInstalledError) {
          setExtensionNotInstalled(true);
        }
      }
    }
    loadData();
  }, [selectedCompany, currentWeekStart, effectiveWeeksToShow, emailDomain, fetchTeamData]);

  // Fetch profile photos
  useEffect(() => {
    if (teamMembers.length === 0) return;

    const fetchPhotos = async () => {
      for (const member of teamMembers) {
        if (member.userPrincipalName && !member.photoUrl) {
          try {
            const photoUrl = await getUserProfilePhoto(member.userPrincipalName);
            if (photoUrl) {
              updateMemberPhoto(member.id, photoUrl);
            }
          } catch {
            // Ignore photo errors
          }
        }
      }
    };

    void fetchPhotos();
  }, [teamMembers.length, updateMemberPhoto]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedAllocationId) {
          selectAllocation(null);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, selectedAllocationId, selectAllocation]);

  // Filter members by search
  const filteredMembers = useMemo(() => {
    if (!searchQuery) return teamMembers;
    const query = searchQuery.toLowerCase();
    return teamMembers.filter(
      (m) => m.name.toLowerCase().includes(query) || m.number.toLowerCase().includes(query)
    );
  }, [teamMembers, searchQuery]);

  // Filter projects by search
  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.number.toLowerCase().includes(query) ||
        p.allocations.some((a) => a.resourceName.toLowerCase().includes(query))
    );
  }, [projects, searchQuery]);

  // Count members without timesheets
  const membersWithoutTimesheet = useMemo(
    () => teamMembers.filter((m) => m.timesheetStatus === 'No Timesheet').length,
    [teamMembers]
  );

  // Handle create timesheets
  const handleCreateTimesheets = async () => {
    const result = await createTimesheetsForSelected();

    if (result.success > 0 && result.failed === 0) {
      toast.success(`Created ${result.success} timesheet${result.success > 1 ? 's' : ''}`);
    } else if (result.success > 0 && result.failed > 0) {
      toast.success(`Created ${result.success} timesheet${result.success > 1 ? 's' : ''}`);
      toast.error(`Failed to create ${result.failed} timesheet${result.failed > 1 ? 's' : ''}`);
    } else if (result.failed > 0) {
      toast.error(`Failed to create timesheets: ${result.errors.join(', ')}`);
    }

    await fetchTeamData(currentWeekStart, effectiveWeeksToShow, emailDomain);
  };

  // Handle assign
  const handleOpenAssignModal = (member: PlanTeamMember) => {
    setAssigningResource({ name: member.name, number: member.number });
    setAssignModalOpen(true);
  };

  const handleAssign = async (projectNumber: string, taskNumber: string, hours: number) => {
    if (!assigningResource) return;

    const success = await createAllocation(
      assigningResource.number,
      projectNumber,
      format(currentWeekStart, 'yyyy-MM-dd'),
      format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      hours
    );

    if (success) {
      toast.success('Assignment created');
      await fetchTeamData(currentWeekStart, effectiveWeeksToShow, emailDomain);
    } else {
      toast.error('Failed to create assignment. BC extension update required.');
    }

    setAssignModalOpen(false);
    setAssigningResource(null);
  };

  // Handle drop
  const handleDrop = async (date: string) => {
    const success = await dropAllocation(date);
    if (success) {
      toast.success('Allocation moved');
      await fetchTeamData(currentWeekStart, effectiveWeeksToShow, emailDomain);
    } else {
      // dropAllocation returns false when not implemented (requires BC extension update)
      toast.error('Move not available. BC extension update required.');
    }
  };

  // Error/loading states
  if (extensionNotInstalled) {
    return (
      <div className="space-y-6">
        <WeekNavigation
          currentWeekStart={currentWeekStart}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onToday={handleToday}
          onDateSelect={handleDateSelect}
        />
        <ExtensionNotInstalled />
      </div>
    );
  }

  if (error && !isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-red-500">{error}</p>
          <button
            onClick={() => fetchTeamData(currentWeekStart, effectiveWeeksToShow, emailDomain)}
            className="text-knowall-green hover:text-knowall-green-light underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Main content
  const planContent = (
    <div ref={containerRef} className={cn('space-y-4', isFullscreen && 'flex h-full flex-col')}>
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="border-dark-600 flex rounded-lg border">
            <button
              onClick={() => setViewMode('team')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors',
                viewMode === 'team'
                  ? 'bg-knowall-green text-dark-950'
                  : 'text-dark-400 hover:text-white'
              )}
            >
              <UserGroupIcon className="h-4 w-4" />
              Team
            </button>
            <button
              onClick={() => setViewMode('projects')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors',
                viewMode === 'projects'
                  ? 'bg-knowall-green text-dark-950'
                  : 'text-dark-400 hover:text-white'
              )}
            >
              <FolderIcon className="h-4 w-4" />
              Projects
            </button>
          </div>

          {/* Week Navigation */}
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onToday={handleToday}
            onDateSelect={handleDateSelect}
          />

          {isFullscreen && (
            <span className="text-dark-400 text-sm">{effectiveWeeksToShow} weeks</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="text-dark-400 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-dark-600 bg-dark-800 text-dark-100 placeholder:text-dark-500 focus:border-knowall-green w-48 rounded-lg border py-1.5 pr-3 pl-9 text-sm focus:ring-1 focus:outline-none"
            />
          </div>

          {/* Zoom Controls */}
          <div className="border-dark-600 flex items-center gap-1 rounded-lg border px-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoomLevel <= MIN_ZOOM}
              title="Zoom out"
              className="h-7 w-7"
            >
              <MinusIcon className="h-4 w-4" />
            </Button>
            <span className="text-dark-400 w-8 text-center text-xs">{zoomLevel}x</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoomLevel >= MAX_ZOOM}
              title="Zoom in"
              className="h-7 w-7"
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Fullscreen Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <XMarkIcon className="h-5 w-5" />
            ) : (
              <ArrowsPointingOutIcon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Action Bar (Team view only) */}
      {viewMode === 'team' && (
        <div className="flex flex-wrap items-center gap-2">
          {membersWithoutTimesheet > 0 && (
            <Button variant="outline" size="sm" onClick={selectAllWithoutTimesheet}>
              <DocumentPlusIcon className="mr-2 h-4 w-4" />
              Select Without Timesheet ({membersWithoutTimesheet})
            </Button>
          )}

          {selectedMemberIds.length > 0 && (
            <>
              <span className="text-dark-400 text-sm">{selectedMemberIds.length} selected</span>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateTimesheets}
                isLoading={isCreatingTimesheets}
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                Create Timesheets
              </Button>
            </>
          )}
        </div>
      )}

      {/* Calendar Grid */}
      <Card
        variant="bordered"
        className={cn('overflow-hidden', isFullscreen && 'flex flex-1 flex-col')}
      >
        {/* Header with dates */}
        <div className="border-dark-700 bg-dark-800/50 flex border-b">
          <div className="w-[190px] shrink-0" />
          <div className="flex flex-1 overflow-x-auto">
            {allDays.map((day, index) => {
              const dayIsToday = isToday(day);
              const isWeekStart = day.getDay() === 1;
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-dark-700 flex flex-col items-center justify-center border-l py-1',
                    dayIsToday && 'bg-knowall-green/10',
                    isWeekStart && index > 0 && 'border-l-2'
                  )}
                  style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px` }}
                >
                  <span className="text-dark-400 text-[10px]">{format(day, 'EEE')}</span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      dayIsToday ? 'text-knowall-green' : 'text-dark-200'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {isWeekStart && (
                    <span className="text-dark-500 text-[10px]">{format(day, 'MMM')}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="w-16 shrink-0" />
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-b-2"></div>
          </div>
        )}

        {/* Content */}
        {!isLoading && (
          <div className={cn('overflow-auto', isFullscreen ? 'flex-1' : 'max-h-[500px]')}>
            {viewMode === 'team' ? (
              // Team View
              filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <ResourceRow
                    key={member.id}
                    member={member}
                    days={allDays}
                    isSelected={selectedMemberIds.includes(member.id)}
                    onToggleSelect={() => toggleMemberSelection(member.id)}
                    selectedAllocationId={selectedAllocationId}
                    onSelectAllocation={selectAllocation}
                    onDragStart={startDrag}
                    onDragEnd={endDrag}
                    onDrop={handleDrop}
                    isDragging={isDragging}
                    dayWidth={dayWidth}
                    showAssignButton={true}
                    onAssign={() => handleOpenAssignModal(member)}
                  />
                ))
              ) : (
                <div className="text-dark-400 py-12 text-center">
                  {searchQuery ? 'No resources match your search' : 'No resources found'}
                </div>
              )
            ) : // Projects View
            filteredProjects.length > 0 ? (
              filteredProjects.map((project) => (
                <ProjectRow
                  key={project.number}
                  project={project}
                  days={allDays}
                  selectedAllocationId={selectedAllocationId}
                  onSelectAllocation={selectAllocation}
                  onDragStart={startDrag}
                  onDragEnd={endDrag}
                  isDragging={isDragging}
                  dayWidth={dayWidth}
                />
              ))
            ) : (
              <div className="text-dark-400 py-12 text-center">
                {searchQuery ? 'No projects match your search' : 'No allocations found'}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-dark-400">Tip:</span>
        <span className="text-dark-300">Click blocks to select</span>
        <span className="text-dark-300">Drag blocks to move</span>
        <span className="text-dark-300">+ button to assign to task</span>
      </div>

      {/* Assign Modal */}
      {assigningResource && (
        <AssignModal
          isOpen={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setAssigningResource(null);
          }}
          resourceName={assigningResource.name}
          resourceNumber={assigningResource.number}
          onAssign={handleAssign}
        />
      )}
    </div>
  );

  // Fullscreen mode
  if (isFullscreen) {
    return <div className="bg-dark-900 fixed inset-0 z-50 flex flex-col p-6">{planContent}</div>;
  }

  return planContent;
}
