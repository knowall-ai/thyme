'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  FolderIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { Card, Button, ExtensionPreviewWrapper } from '@/components/ui';
import { PlanEntryModal } from './PlanEntryModal';
import { PlanResourceModal } from './PlanResourceModal';
import { PlanEditModal } from './PlanEditModal';
import { usePlanStore } from '@/hooks';
import { useCompanyStore } from '@/hooks';
import { useAuth, getUserProfilePhoto } from '@/services/auth';
import { ExtensionNotInstalledError } from '@/services/bc';
import { cn, getBCResourceUrl, getBCJobUrl } from '@/utils';
import type { AllocationBlock, PlanTeamMember, PlanProject, ViewMode } from '@/hooks/usePlanStore';
import {
  addWeeks,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  format,
  getWeek,
  isSameDay,
  isToday,
  isWeekend,
} from 'date-fns';

// Context for adding plans - allows pre-selecting project, task, and resource
interface AddPlanContext {
  projectCode?: string;
  taskCode?: string;
  resourceNo?: string;
}

// Resource Row Component with expandable allocations
interface ResourceRowProps {
  member: PlanTeamMember;
  days: Date[];
  selectedAllocationId: string | null;
  onSelectAllocation: (id: string | null) => void;
  onEditAllocation: (id: string) => void;
  onDragStart: (allocation: AllocationBlock) => void;
  onDragEnd: () => void;
  onDrop: (date: string) => void;
  isDragging: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAddPlan: (weekStart: Date, context?: AddPlanContext) => void;
  companyName?: string;
}

function ResourceRow({
  member,
  days,
  selectedAllocationId,
  onSelectAllocation,
  onEditAllocation,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging,
  isExpanded,
  onToggleExpand,
  onAddPlan,
  companyName,
}: ResourceRowProps) {
  const [hoveredWeekStart, setHoveredWeekStart] = useState<Date | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  // Group allocations by project
  const allocationsByProject = useMemo(() => {
    const map = new Map<
      string,
      { projectNumber: string; projectName: string; color: string; allocations: AllocationBlock[] }
    >();
    for (const allocation of member.allocations) {
      const key = allocation.projectNumber;
      if (!map.has(key)) {
        map.set(key, {
          projectNumber: allocation.projectNumber,
          projectName: allocation.projectName,
          color: allocation.color,
          allocations: [],
        });
      }
      map.get(key)!.allocations.push(allocation);
    }
    return map;
  }, [member.allocations]);

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

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

  // Group days by week for "Add plan" button
  const weekGroups = useMemo(() => {
    const groups: { weekStart: Date; days: Date[] }[] = [];
    let currentGroup: { weekStart: Date; days: Date[] } | null = null;

    for (const day of days) {
      const dayOfWeek = day.getDay();
      // Monday = 1 starts a new week
      if (dayOfWeek === 1 || !currentGroup) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = { weekStart: day, days: [day] };
      } else {
        currentGroup.days.push(day);
      }
    }
    if (currentGroup) {
      groups.push(currentGroup);
    }
    return groups;
  }, [days]);

  return (
    <div className="border-dark-700 w-full border-b">
      {/* Main Row */}
      <div
        className={cn(
          'hover:bg-dark-700/60 flex w-full items-center transition-colors',
          isExpanded && 'bg-dark-800/30'
        )}
      >
        {/* Sticky name column */}
        <div
          className={cn(
            'bg-dark-900 sticky left-0 z-10 flex w-[230px] shrink-0 items-center',
            isExpanded && 'bg-dark-800/30'
          )}
        >
          {/* Avatar and Name - clickable to expand */}
          <div
            className="flex flex-1 items-center gap-2 overflow-hidden px-3 py-2"
            title={member.name}
          >
            {/* Expand/Collapse chevron */}
            <button
              className="text-dark-400 hover:text-dark-200 flex-shrink-0 cursor-pointer"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              onClick={onToggleExpand}
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </button>

            {member.photoUrl ? (
              <img
                src={member.photoUrl}
                alt={member.name}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
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
                  member.timesheetStatus === 'No Timesheet'
                    ? 'No timesheet for this week'
                    : undefined
                }
              >
                {member.timesheetStatus === 'No Timesheet' ? '?' : initials}
              </div>
            )}
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-dark-500 truncate text-[10px]">{member.number}</p>
              <p className="text-dark-100 truncate text-sm leading-tight font-medium">
                {member.name}
              </p>
            </div>
          </div>
          {/* BC Link */}
          <a
            href={getBCResourceUrl(member.number, companyName)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dark-500 hover:text-knowall-green mr-2 flex-shrink-0 transition-colors"
            title="Open in Business Central"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        </div>

        {/* Calendar Grid with Allocations */}
        <div className="relative flex flex-1" style={{ minHeight: '40px' }}>
          {/* Week groups with Add Plan button */}
          {weekGroups.map((weekGroup) => (
            <div
              key={weekGroup.weekStart.toISOString()}
              className="group relative flex flex-1"
              onMouseEnter={() => setHoveredWeekStart(weekGroup.weekStart)}
              onMouseLeave={() => setHoveredWeekStart(null)}
            >
              {/* Day cells within this week */}
              {weekGroup.days.map((day) => {
                const dayIsToday = isToday(day);
                const dayIsWeekend = isWeekend(day);
                const dayStr = format(day, 'yyyy-MM-dd');
                // Calculate hours for this day
                const dayHours = member.allocations
                  .filter((a) => a.startDate === dayStr)
                  .reduce((sum, a) => sum + a.hoursPerDay, 0);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-dark-700 relative h-10 flex-1 border-l',
                      dayIsWeekend && 'bg-dark-700/60',
                      dayIsToday && 'bg-knowall-green/5',
                      isDragging && 'hover:bg-dark-700/50'
                    )}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day)}
                  >
                    {/* Daily hours indicator - full width cell, clickable to expand */}
                    {dayHours > 0 && (
                      <div
                        className="bg-knowall-green/90 text-dark-950 absolute inset-0.5 flex cursor-pointer items-center justify-center rounded text-xs font-semibold"
                        onClick={onToggleExpand}
                        title="Click to expand and edit allocations"
                      >
                        {dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Plan button - appears on hover, spans whole week */}
              {hoveredWeekStart &&
                isSameDay(hoveredWeekStart, weekGroup.weekStart) &&
                member.allocations.filter((a) => {
                  const allocDate = new Date(a.startDate);
                  return weekGroup.days.some((d) => isSameDay(d, allocDate));
                }).length === 0 && (
                  <button
                    onClick={() => onAddPlan(weekGroup.weekStart)}
                    className="border-dark-600 text-dark-500 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green absolute inset-1 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs opacity-0 transition-all group-hover:opacity-100"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Add
                  </button>
                )}
            </div>
          ))}
        </div>

        {/* Total Hours */}
        <div className="text-dark-300 w-16 shrink-0 px-2 text-right text-sm">
          {member.totalHours > 0 && `${member.totalHours.toFixed(1)}h`}
        </div>
      </div>

      {/* Expanded Content: Projects list (grouped by project, expandable to show tasks) */}
      {isExpanded && (
        <div className="bg-dark-850 border-dark-700 border-t">
          {/* Projects grouped - sorted alphabetically by project name */}
          {Array.from(allocationsByProject.entries())
            .sort(([, a], [, b]) => a.projectName.localeCompare(b.projectName))
            .map(([projectNumber, projectData]) => {
              const isProjectExpanded = expandedProjectIds.has(projectNumber);
              const projectTotalHours = projectData.allocations.reduce(
                (sum, a) => sum + a.totalHours,
                0
              );

              return (
                <div key={projectNumber}>
                  {/* Project row - clickable to expand/collapse tasks, with Add button */}
                  <TeamProjectRow
                    projectData={projectData}
                    weekGroups={weekGroups}
                    projectTotalHours={projectTotalHours}
                    isExpanded={isProjectExpanded}
                    onToggleExpand={() => toggleProjectExpanded(projectNumber)}
                    onAddPlan={onAddPlan}
                  />

                  {/* Task rows - shown when project is expanded, consolidated by task */}
                  {isProjectExpanded &&
                    (() => {
                      // Group allocations by task
                      const taskGroups = new Map<
                        string,
                        { taskNumber: string; taskName: string; allocations: AllocationBlock[] }
                      >();
                      for (const allocation of projectData.allocations) {
                        const taskKey = allocation.taskNumber || 'no-task';
                        if (!taskGroups.has(taskKey)) {
                          taskGroups.set(taskKey, {
                            taskNumber: allocation.taskNumber || '',
                            taskName: allocation.taskName || '(No task)',
                            allocations: [],
                          });
                        }
                        taskGroups.get(taskKey)!.allocations.push(allocation);
                      }

                      return Array.from(taskGroups.entries())
                        .sort(([, a], [, b]) => a.taskName.localeCompare(b.taskName))
                        .map(([taskKey, taskData]) => {
                          const taskTotalHours = taskData.allocations.reduce(
                            (sum, a) => sum + a.totalHours,
                            0
                          );
                          // Use the first allocation's ID for edit (will load all lines for that task)
                          const firstAllocation = taskData.allocations[0];

                          return (
                            <TeamTaskRow
                              key={taskKey}
                              taskData={taskData}
                              projectData={projectData}
                              weekGroups={weekGroups}
                              taskTotalHours={taskTotalHours}
                              firstAllocation={firstAllocation}
                              onEditAllocation={onEditAllocation}
                              onAddPlan={onAddPlan}
                            />
                          );
                        });
                    })()}
                </div>
              );
            })}

          {/* Add Project row */}
          <div className="hover:bg-dark-700/60 flex w-full items-center">
            <div className="bg-dark-850 sticky left-0 z-10 flex shrink-0">
              <div className="text-dark-500 w-[230px] py-1.5 pr-4 pl-12 text-xs italic">
                + Add project
              </div>
            </div>
            <div className="relative flex flex-1" style={{ minHeight: '28px' }}>
              {/* Week groups with Add Plan button */}
              {weekGroups.map((weekGroup) => (
                <div
                  key={weekGroup.weekStart.toISOString()}
                  className="group relative flex flex-1"
                  onMouseEnter={() => setHoveredWeekStart(weekGroup.weekStart)}
                  onMouseLeave={() => setHoveredWeekStart(null)}
                >
                  {/* Day cells within this week */}
                  {weekGroup.days.map((day) => {
                    const dayIsToday = isToday(day);
                    const dayIsWeekend = isWeekend(day);
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'border-dark-700 h-7 flex-1 border-l',
                          dayIsWeekend && 'bg-dark-700/60',
                          dayIsToday && 'bg-knowall-green/5'
                        )}
                      />
                    );
                  })}

                  {/* Add Plan button - appears on hover */}
                  {hoveredWeekStart && isSameDay(hoveredWeekStart, weekGroup.weekStart) && (
                    <button
                      onClick={() => onAddPlan(weekGroup.weekStart)}
                      className="border-dark-600 text-dark-500 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green absolute inset-0.5 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed text-[10px] opacity-0 transition-all group-hover:opacity-100"
                    >
                      <PlusIcon className="h-3 w-3" />
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="w-16 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}

// Team Task Row Component (for Team view - shows task under a project with add capability)
interface TeamTaskRowProps {
  taskData: { taskNumber: string; taskName: string; allocations: AllocationBlock[] };
  projectData: {
    projectNumber: string;
    projectName: string;
    color: string;
    allocations: AllocationBlock[];
  };
  weekGroups: { weekStart: Date; days: Date[] }[];
  taskTotalHours: number;
  firstAllocation: AllocationBlock;
  onEditAllocation: (id: string) => void;
  onAddPlan: (weekStart: Date, context?: AddPlanContext) => void;
}

function TeamTaskRow({
  taskData,
  projectData,
  weekGroups,
  taskTotalHours,
  firstAllocation,
  onEditAllocation,
  onAddPlan,
}: TeamTaskRowProps) {
  const [hoveredWeekStart, setHoveredWeekStart] = useState<Date | null>(null);

  return (
    <div className="hover:bg-dark-700/40 flex w-full items-center">
      {/* Sticky name column - deeper indent for tasks */}
      <div className="bg-dark-850 sticky left-0 z-10 flex shrink-0">
        <div
          className="flex w-[230px] cursor-pointer items-center gap-2 overflow-hidden py-1 pr-4 pl-16"
          title={taskData.taskName}
          onClick={(e) => {
            e.stopPropagation();
            onEditAllocation(firstAllocation.id);
          }}
        >
          <span className="text-dark-500 truncate text-xs">{taskData.taskName}</span>
        </div>
      </div>
      {/* Day cells - grouped by week for hover effect */}
      <div className="relative flex flex-1" style={{ minHeight: '24px' }}>
        {weekGroups.map((weekGroup) => {
          // Check if this week has any hours
          const weekHasHours = weekGroup.days.some((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            return taskData.allocations.some((a) => a.startDate === dayStr);
          });

          return (
            <div
              key={weekGroup.weekStart.toISOString()}
              className="group relative flex flex-1"
              onMouseEnter={() => setHoveredWeekStart(weekGroup.weekStart)}
              onMouseLeave={() => setHoveredWeekStart(null)}
            >
              {weekGroup.days.map((day) => {
                const dayIsToday = isToday(day);
                const dayIsWeekend = isWeekend(day);
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayHours = taskData.allocations
                  .filter((a) => a.startDate === dayStr)
                  .reduce((sum, a) => sum + a.hoursPerDay, 0);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-dark-700 relative h-6 flex-1 cursor-pointer border-l',
                      dayIsWeekend && 'bg-dark-700/60',
                      dayIsToday && 'bg-knowall-green/5'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dayHours > 0) {
                        onEditAllocation(firstAllocation.id);
                      } else {
                        onAddPlan(weekGroup.weekStart, {
                          projectCode: projectData.projectNumber,
                          taskCode: taskData.taskNumber,
                        });
                      }
                    }}
                  >
                    {dayHours > 0 && (
                      <div
                        className="absolute inset-0.5 flex items-center justify-center rounded text-[10px] font-medium text-white/80"
                        style={{ backgroundColor: `${projectData.color}99` }}
                      >
                        {dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Plan button - appears on hover when no hours in this week */}
              {hoveredWeekStart &&
                isSameDay(hoveredWeekStart, weekGroup.weekStart) &&
                !weekHasHours && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddPlan(weekGroup.weekStart, {
                        projectCode: projectData.projectNumber,
                        taskCode: taskData.taskNumber,
                      });
                    }}
                    className="border-dark-600 text-dark-500 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green absolute inset-0.5 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed text-[10px] opacity-0 transition-all group-hover:opacity-100"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Add
                  </button>
                )}
            </div>
          );
        })}
      </div>
      {/* Total hours */}
      <div className="text-dark-500 w-16 shrink-0 px-2 text-right text-[10px]">
        {taskTotalHours.toFixed(1)}h
      </div>
    </div>
  );
}

// Team Project Row Component (for Team view - shows project under a resource with add capability)
interface TeamProjectRowProps {
  projectData: {
    projectNumber: string;
    projectName: string;
    color: string;
    allocations: AllocationBlock[];
  };
  weekGroups: { weekStart: Date; days: Date[] }[];
  projectTotalHours: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAddPlan: (weekStart: Date, context?: AddPlanContext) => void;
}

function TeamProjectRow({
  projectData,
  weekGroups,
  projectTotalHours,
  isExpanded,
  onToggleExpand,
  onAddPlan,
}: TeamProjectRowProps) {
  const [hoveredWeekStart, setHoveredWeekStart] = useState<Date | null>(null);

  return (
    <div className="hover:bg-dark-700/60 flex w-full items-center" title="Click to show/hide tasks">
      {/* Sticky name column */}
      <div className="bg-dark-850 sticky left-0 z-10 flex shrink-0">
        <div
          className="flex w-[230px] items-center gap-2 overflow-hidden py-1.5 pr-4 pl-8"
          title={projectData.projectName}
        >
          {/* Expand/Collapse chevron */}
          <button
            className="text-dark-400 hover:text-dark-200 flex-shrink-0 cursor-pointer"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-3 w-3" />
            ) : (
              <ChevronRightIcon className="h-3 w-3" />
            )}
          </button>
          <div
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: projectData.color }}
          />
          <span className="text-dark-300 truncate text-xs">{projectData.projectName}</span>
        </div>
      </div>
      {/* Day cells - grouped by week for hover effect */}
      <div className="relative flex flex-1" style={{ minHeight: '28px' }}>
        {weekGroups.map((weekGroup) => {
          // Check if this week has any hours
          const weekHasHours = weekGroup.days.some((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            return projectData.allocations.some((a) => a.startDate === dayStr);
          });

          return (
            <div
              key={weekGroup.weekStart.toISOString()}
              className="group relative flex flex-1"
              onMouseEnter={() => setHoveredWeekStart(weekGroup.weekStart)}
              onMouseLeave={() => setHoveredWeekStart(null)}
            >
              {weekGroup.days.map((day) => {
                const dayIsToday = isToday(day);
                const dayIsWeekend = isWeekend(day);
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayHours = projectData.allocations
                  .filter((a) => a.startDate === dayStr)
                  .reduce((sum, a) => sum + a.hoursPerDay, 0);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-dark-700 relative h-7 flex-1 cursor-pointer border-l',
                      dayIsWeekend && 'bg-dark-700/60',
                      dayIsToday && 'bg-knowall-green/5'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dayHours > 0) {
                        onToggleExpand();
                      } else {
                        onAddPlan(weekGroup.weekStart, {
                          projectCode: projectData.projectNumber,
                        });
                      }
                    }}
                  >
                    {dayHours > 0 && (
                      <div
                        className="absolute inset-0.5 flex items-center justify-center rounded text-[10px] font-semibold text-white"
                        style={{ backgroundColor: projectData.color }}
                      >
                        {dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Plan button - appears on hover when no hours in this week */}
              {hoveredWeekStart &&
                isSameDay(hoveredWeekStart, weekGroup.weekStart) &&
                !weekHasHours && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddPlan(weekGroup.weekStart, {
                        projectCode: projectData.projectNumber,
                      });
                    }}
                    className="border-dark-600 text-dark-500 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green absolute inset-0.5 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed text-[10px] opacity-0 transition-all group-hover:opacity-100"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Add
                  </button>
                )}
            </div>
          );
        })}
      </div>
      {/* Total hours */}
      <div className="text-dark-400 w-16 shrink-0 px-2 text-right text-xs">
        {projectTotalHours.toFixed(1)}h
      </div>
    </div>
  );
}

// Task Row Component (for Projects view - shows task under a project with add capability)
interface TaskRowProps {
  taskData: { taskNumber: string; taskName: string; allocations: AllocationBlock[] };
  taskKey: string;
  days: Date[];
  weekGroups: { weekStart: Date; days: Date[] }[];
  projectColor: string;
  isTaskExpanded: boolean;
  onToggleExpand: () => void;
  onAddPlan: (weekStart: Date, context?: AddPlanContext) => void;
  taskTotalHours: number;
}

function TaskRow({
  taskData,
  taskKey,
  days,
  weekGroups,
  projectColor,
  isTaskExpanded,
  onToggleExpand,
  onAddPlan,
  taskTotalHours,
}: TaskRowProps) {
  const [hoveredWeekStart, setHoveredWeekStart] = useState<Date | null>(null);

  return (
    <div
      className="hover:bg-dark-700/60 flex w-full items-center"
      title="Click to show/hide resources"
    >
      {/* Sticky name column */}
      <div className="bg-dark-850 sticky left-0 z-10 flex shrink-0">
        <div
          className="flex w-[230px] cursor-pointer items-center gap-2 overflow-hidden py-1.5 pr-4 pl-8"
          title={taskData.taskName}
          onClick={onToggleExpand}
        >
          {/* Expand/Collapse chevron */}
          <button
            className="text-dark-400 hover:text-dark-200 flex-shrink-0"
            aria-label={isTaskExpanded ? 'Collapse' : 'Expand'}
          >
            {isTaskExpanded ? (
              <ChevronDownIcon className="h-3 w-3" />
            ) : (
              <ChevronRightIcon className="h-3 w-3" />
            )}
          </button>
          <span className="text-dark-300 truncate text-xs">{taskData.taskName}</span>
        </div>
      </div>
      {/* Day cells - grouped by week for hover effect */}
      <div className="relative flex flex-1" style={{ minHeight: '28px' }}>
        {weekGroups.map((weekGroup) => {
          // Check if this week has any hours
          const weekHasHours = weekGroup.days.some((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            return taskData.allocations.some((a) => a.startDate === dayStr);
          });

          return (
            <div
              key={weekGroup.weekStart.toISOString()}
              className="group relative flex flex-1"
              onMouseEnter={() => setHoveredWeekStart(weekGroup.weekStart)}
              onMouseLeave={() => setHoveredWeekStart(null)}
            >
              {weekGroup.days.map((day) => {
                const dayIsToday = isToday(day);
                const dayIsWeekend = isWeekend(day);
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayHours = taskData.allocations
                  .filter((a) => a.startDate === dayStr)
                  .reduce((sum, a) => sum + a.hoursPerDay, 0);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-dark-700 relative h-7 flex-1 cursor-pointer border-l',
                      dayIsWeekend && 'bg-dark-700/60',
                      dayIsToday && 'bg-knowall-green/5'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dayHours > 0) {
                        onToggleExpand();
                      } else {
                        onAddPlan(weekGroup.weekStart, { taskCode: taskData.taskNumber });
                      }
                    }}
                  >
                    {dayHours > 0 && (
                      <div
                        className="absolute inset-0.5 flex items-center justify-center rounded text-[10px] font-semibold text-white"
                        style={{ backgroundColor: projectColor }}
                      >
                        {dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Plan button - appears on hover when no hours in this week */}
              {hoveredWeekStart &&
                isSameDay(hoveredWeekStart, weekGroup.weekStart) &&
                !weekHasHours && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddPlan(weekGroup.weekStart, { taskCode: taskData.taskNumber });
                    }}
                    className="border-dark-600 text-dark-500 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green absolute inset-0.5 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed text-[10px] opacity-0 transition-all group-hover:opacity-100"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Add
                  </button>
                )}
            </div>
          );
        })}
      </div>
      {/* Total hours */}
      <div className="text-dark-400 w-16 shrink-0 px-2 text-right text-xs">
        {taskTotalHours.toFixed(1)}h
      </div>
    </div>
  );
}

// Resource-Task Row Component (for Projects view - shows resource under a task with add capability)
interface ResourceTaskRowProps {
  allocations: AllocationBlock[];
  days: Date[];
  weekGroups: { weekStart: Date; days: Date[] }[];
  projectColor: string;
  projectNumber: string;
  taskNumber: string;
  taskName: string;
  onEditAllocation: (id: string) => void;
  onAddPlan: (weekStart: Date, context?: AddPlanContext) => void;
}

function ResourceTaskRow({
  allocations,
  days,
  weekGroups,
  projectColor,
  projectNumber,
  taskNumber,
  taskName,
  onEditAllocation,
  onAddPlan,
}: ResourceTaskRowProps) {
  const [hoveredWeekStart, setHoveredWeekStart] = useState<Date | null>(null);
  const firstAlloc = allocations[0];

  return (
    <div className="hover:bg-dark-700/40 flex w-full items-center">
      {/* Sticky name column - deeper indent for resources */}
      <div className="bg-dark-850 sticky left-0 z-10 flex shrink-0">
        <div
          className="flex w-[230px] cursor-pointer items-center gap-2 overflow-hidden py-1 pr-4 pl-16"
          title={firstAlloc.resourceName}
          onClick={(e) => {
            e.stopPropagation();
            onEditAllocation(firstAlloc.id);
          }}
        >
          <span className="text-dark-500 truncate text-xs">{firstAlloc.resourceName}</span>
        </div>
      </div>
      {/* Day cells - grouped by week for hover effect */}
      <div className="relative flex flex-1" style={{ minHeight: '24px' }}>
        {weekGroups.map((weekGroup) => {
          // Check if this week has any hours
          const weekHasHours = weekGroup.days.some((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            return allocations.some((a) => a.startDate === dayStr);
          });

          return (
            <div
              key={weekGroup.weekStart.toISOString()}
              className="group relative flex flex-1"
              onMouseEnter={() => setHoveredWeekStart(weekGroup.weekStart)}
              onMouseLeave={() => setHoveredWeekStart(null)}
            >
              {weekGroup.days.map((day) => {
                const dayIsToday = isToday(day);
                const dayIsWeekend = isWeekend(day);
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayHours = allocations
                  .filter((a) => a.startDate === dayStr)
                  .reduce((sum, a) => sum + a.hoursPerDay, 0);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-dark-700 relative h-6 flex-1 cursor-pointer border-l',
                      dayIsWeekend && 'bg-dark-700/60',
                      dayIsToday && 'bg-knowall-green/5'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dayHours > 0) {
                        onEditAllocation(firstAlloc.id);
                      } else {
                        onAddPlan(weekGroup.weekStart, {
                          taskCode: taskNumber,
                          resourceNo: firstAlloc.resourceNumber,
                        });
                      }
                    }}
                  >
                    {dayHours > 0 && (
                      <div
                        className="absolute inset-0.5 flex items-center justify-center rounded text-[10px] font-medium text-white/80"
                        style={{ backgroundColor: `${projectColor}99` }}
                      >
                        {dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Plan button - appears on hover when no hours in this week */}
              {hoveredWeekStart &&
                isSameDay(hoveredWeekStart, weekGroup.weekStart) &&
                !weekHasHours && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddPlan(weekGroup.weekStart, {
                        taskCode: taskNumber,
                        resourceNo: firstAlloc.resourceNumber,
                      });
                    }}
                    className="border-dark-600 text-dark-500 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green absolute inset-0.5 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed text-[10px] opacity-0 transition-all group-hover:opacity-100"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Add
                  </button>
                )}
            </div>
          );
        })}
      </div>
      {/* Total hours */}
      <div className="text-dark-500 w-16 shrink-0 px-2 text-right text-[10px]">
        {allocations.reduce((sum, a) => sum + a.totalHours, 0).toFixed(1)}h
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
  onEditAllocation: (id: string) => void;
  onDragStart: (allocation: AllocationBlock) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onAddPlan: (weekStart: Date, context?: AddPlanContext) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  companyName?: string;
}

function ProjectRow({
  project,
  days,
  selectedAllocationId,
  onSelectAllocation,
  onEditAllocation,
  onDragStart,
  onDragEnd,
  isDragging,
  onAddPlan,
  isExpanded,
  onToggleExpand,
  companyName,
}: ProjectRowProps) {
  const [hoveredWeekStart, setHoveredWeekStart] = useState<Date | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  // Group allocations by task, then by resource within each task
  const allocationsByTask = useMemo(() => {
    const map = new Map<
      string,
      { taskNumber: string; taskName: string; allocations: AllocationBlock[] }
    >();
    for (const allocation of project.allocations) {
      const key = allocation.taskNumber || 'no-task';
      if (!map.has(key)) {
        map.set(key, {
          taskNumber: allocation.taskNumber || '',
          taskName: allocation.taskName || '(No task)',
          allocations: [],
        });
      }
      map.get(key)!.allocations.push(allocation);
    }
    return map;
  }, [project.allocations]);

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Group allocations by resource within a task
  const groupByResource = (allocations: AllocationBlock[]) => {
    const map = new Map<string, AllocationBlock[]>();
    for (const allocation of allocations) {
      const key = allocation.resourceNumber;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(allocation);
    }
    return map;
  };

  // Group days into weeks for hover effect
  const weekGroups = useMemo(() => {
    const groups: { weekStart: Date; days: Date[] }[] = [];
    let currentWeek: Date[] = [];
    let currentWeekStart: Date | null = null;

    days.forEach((day) => {
      const weekStart = startOfWeek(day, { weekStartsOn: 1 });
      if (!currentWeekStart || weekStart.getTime() !== currentWeekStart.getTime()) {
        if (currentWeek.length > 0 && currentWeekStart) {
          groups.push({ weekStart: currentWeekStart, days: currentWeek });
        }
        currentWeek = [day];
        currentWeekStart = weekStart;
      } else {
        currentWeek.push(day);
      }
    });

    if (currentWeek.length > 0 && currentWeekStart) {
      groups.push({ weekStart: currentWeekStart, days: currentWeek });
    }

    return groups;
  }, [days]);

  return (
    <div className="border-dark-700 w-full border-b">
      {/* Project Header Row - clickable to expand */}
      <div
        className={cn(
          'hover:bg-dark-700/60 flex w-full items-center transition-colors',
          isExpanded && 'bg-dark-800/30'
        )}
      >
        {/* Sticky name column */}
        <div
          className={cn(
            'bg-dark-900 sticky left-0 z-10 flex w-[230px] shrink-0 items-center',
            isExpanded && 'bg-dark-800/30'
          )}
        >
          <div
            className="flex flex-1 cursor-pointer items-center gap-2 overflow-hidden px-3 py-2"
            onClick={onToggleExpand}
            title={project.name}
          >
            {/* Expand/Collapse chevron */}
            <button
              className="text-dark-400 hover:text-dark-200 flex-shrink-0"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </button>
            <div
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <div className="min-w-0 flex-1 overflow-hidden">
              {project.customerName && (
                <p className="text-dark-500 truncate text-[10px]">{project.customerName}</p>
              )}
              <p className="text-dark-100 truncate text-sm leading-tight font-medium">
                {project.name}
              </p>
            </div>
          </div>
          {/* BC Link */}
          <a
            href={getBCJobUrl(project.number, companyName)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dark-500 hover:text-knowall-green mr-2 flex-shrink-0 transition-colors"
            title="Open in Business Central"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        </div>

        {/* Calendar Grid with daily totals */}
        <div className="relative flex flex-1" style={{ minHeight: '40px' }}>
          {weekGroups.map((weekGroup) => (
            <div
              key={weekGroup.weekStart.toISOString()}
              className="group relative flex flex-1"
              onMouseEnter={() => setHoveredWeekStart(weekGroup.weekStart)}
              onMouseLeave={() => setHoveredWeekStart(null)}
            >
              {weekGroup.days.map((day) => {
                const dayIsToday = isToday(day);
                const dayIsWeekend = isWeekend(day);
                const dayStr = format(day, 'yyyy-MM-dd');
                // Calculate total hours for this project on this day
                const dayHours = project.allocations
                  .filter((a) => a.startDate === dayStr)
                  .reduce((sum, a) => sum + a.hoursPerDay, 0);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-dark-700 relative h-10 flex-1 border-l',
                      dayIsWeekend && 'bg-dark-700/60',
                      dayIsToday && 'bg-knowall-green/5'
                    )}
                  >
                    {/* Daily hours indicator - full width cell */}
                    {dayHours > 0 && (
                      <div
                        className="absolute inset-0.5 flex items-center justify-center rounded text-xs font-semibold text-white"
                        style={{ backgroundColor: project.color }}
                      >
                        {dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Plan button - appears on hover when no allocations for this week */}
              {hoveredWeekStart &&
                isSameDay(hoveredWeekStart, weekGroup.weekStart) &&
                project.allocations.filter((a) => {
                  const allocDate = new Date(a.startDate);
                  return weekGroup.days.some((d) => isSameDay(d, allocDate));
                }).length === 0 && (
                  <button
                    onClick={() => onAddPlan(weekGroup.weekStart)}
                    className="border-dark-600 text-dark-500 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green absolute inset-1 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs opacity-0 transition-all group-hover:opacity-100"
                  >
                    <PlusIcon className="h-3 w-3" />
                    Add
                  </button>
                )}
            </div>
          ))}
        </div>

        {/* Total Hours */}
        <div className="text-dark-300 w-16 shrink-0 px-2 text-right text-sm">
          {project.totalHours > 0 && `${project.totalHours.toFixed(1)}h`}
        </div>
      </div>

      {/* Expanded Content: Tasks list (grouped by task, expandable to show resources) */}
      {isExpanded && (
        <div className="bg-dark-850 border-dark-700 border-t">
          {/* Tasks under this project - sorted alphabetically by task name */}
          {Array.from(allocationsByTask.entries())
            .sort(([, a], [, b]) => a.taskName.localeCompare(b.taskName))
            .map(([taskKey, taskData]) => {
              const isTaskExpanded = expandedTaskIds.has(taskKey);
              const taskTotalHours = taskData.allocations.reduce((sum, a) => sum + a.totalHours, 0);
              const resourcesByTask = groupByResource(taskData.allocations);

              return (
                <div key={taskKey}>
                  {/* Task row - clickable to expand/collapse resources */}
                  <TaskRow
                    taskData={taskData}
                    taskKey={taskKey}
                    days={days}
                    weekGroups={weekGroups}
                    projectColor={project.color}
                    isTaskExpanded={isTaskExpanded}
                    onToggleExpand={() => toggleTaskExpanded(taskKey)}
                    onAddPlan={onAddPlan}
                    taskTotalHours={taskTotalHours}
                  />

                  {/* Resource rows - shown when task is expanded, sorted alphabetically */}
                  {isTaskExpanded &&
                    Array.from(resourcesByTask.entries())
                      .sort(([, a], [, b]) => a[0].resourceName.localeCompare(b[0].resourceName))
                      .map(([resourceNumber, allocations]) => (
                        <ResourceTaskRow
                          key={resourceNumber}
                          allocations={allocations}
                          days={days}
                          weekGroups={weekGroups}
                          projectColor={project.color}
                          projectNumber={project.number}
                          taskNumber={taskData.taskNumber}
                          taskName={taskData.taskName}
                          onEditAllocation={onEditAllocation}
                          onAddPlan={onAddPlan}
                        />
                      ))}
                </div>
              );
            })}

          {/* Add Resource row */}
          <div className="hover:bg-dark-700/60 flex w-full items-center">
            <div className="bg-dark-850 sticky left-0 z-10 flex shrink-0">
              <div className="text-dark-500 w-[230px] py-1.5 pr-4 pl-12 text-xs italic">
                + Add resource
              </div>
            </div>
            <div className="relative flex flex-1" style={{ minHeight: '28px' }}>
              {/* Week groups with Add Plan button */}
              {weekGroups.map((weekGroup) => (
                <div
                  key={weekGroup.weekStart.toISOString()}
                  className="group relative flex flex-1"
                  onMouseEnter={() => setHoveredWeekStart(weekGroup.weekStart)}
                  onMouseLeave={() => setHoveredWeekStart(null)}
                >
                  {/* Day cells within this week */}
                  {weekGroup.days.map((day) => {
                    const dayIsToday = isToday(day);
                    const dayIsWeekend = isWeekend(day);
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'border-dark-700 h-7 flex-1 border-l',
                          dayIsWeekend && 'bg-dark-700/60',
                          dayIsToday && 'bg-knowall-green/5'
                        )}
                      />
                    );
                  })}

                  {/* Add Plan button - appears on hover */}
                  {hoveredWeekStart && isSameDay(hoveredWeekStart, weekGroup.weekStart) && (
                    <button
                      onClick={() => onAddPlan(weekGroup.weekStart)}
                      className="border-dark-600 text-dark-500 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green absolute inset-0.5 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed text-[10px] opacity-0 transition-all group-hover:opacity-100"
                    >
                      <PlusIcon className="h-3 w-3" />
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="w-16 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}

export function PlanPanel() {
  const { selectedCompany, companyVersion } = useCompanyStore();
  const { account } = useAuth();
  const userEmail = account?.username || '';
  const emailDomain = userEmail ? userEmail.split('@')[1] : undefined;

  const {
    teamMembers,
    projects,
    viewMode,
    isLoading,
    error,
    selectedAllocationId,
    isDragging,
    fetchTeamData,
    clearCache,
    setCurrentWeekStart,
    setViewMode,
    updateMemberPhoto,
    selectAllocation,
    startDrag,
    endDrag,
    dropAllocation,
  } = usePlanStore();

  const [currentWeekStart, setLocalWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [extensionNotInstalled, setExtensionNotInstalled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  // Modal state for adding plans (Team view)
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [selectedMemberForPlan, setSelectedMemberForPlan] = useState<PlanTeamMember | null>(null);
  const [selectedDateForPlan, setSelectedDateForPlan] = useState<Date>(new Date());
  const [preSelectedProjectCode, setPreSelectedProjectCode] = useState<string | undefined>(
    undefined
  );
  const [preSelectedTeamTaskCode, setPreSelectedTeamTaskCode] = useState<string | undefined>(
    undefined
  );

  // Modal state for adding plans (Projects view)
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [selectedProjectForPlan, setSelectedProjectForPlan] = useState<PlanProject | null>(null);
  const [preSelectedTaskCode, setPreSelectedTaskCode] = useState<string | undefined>(undefined);
  const [preSelectedResourceNo, setPreSelectedResourceNo] = useState<string | undefined>(undefined);

  // Modal state for editing allocations
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAllocationForEdit, setSelectedAllocationForEdit] =
    useState<AllocationBlock | null>(null);

  // Show 3 weeks in regular view, 6 weeks in fullscreen
  const effectiveWeeksToShow = isFullscreen ? 6 : 3;

  // Calculate all days to display
  const allDays = useMemo(() => {
    const endDate = endOfWeek(addWeeks(currentWeekStart, effectiveWeeksToShow - 1), {
      weekStartsOn: 1,
    });
    return eachDayOfInterval({ start: currentWeekStart, end: endDate });
  }, [currentWeekStart, effectiveWeeksToShow]);

  // Group days by week for header
  const headerWeekGroups = useMemo(() => {
    const groups: { weekStart: Date; weekNumber: number; month: string; days: Date[] }[] = [];
    let currentGroup: { weekStart: Date; weekNumber: number; month: string; days: Date[] } | null =
      null;

    for (const day of allDays) {
      const dayOfWeek = day.getDay();
      // Monday = 1 starts a new week
      if (dayOfWeek === 1 || !currentGroup) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          weekStart: day,
          weekNumber: getWeek(day, { weekStartsOn: 1 }),
          month: format(day, 'MMM'),
          days: [day],
        };
      } else {
        currentGroup.days.push(day);
      }
    }
    if (currentGroup) {
      groups.push(currentGroup);
    }
    return groups;
  }, [allDays]);

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

  // Clear cache when company changes to force fresh data fetch
  useEffect(() => {
    clearCache();
  }, [companyVersion, clearCache]);

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
    // companyVersion ensures refetch when company switches
  }, [companyVersion, currentWeekStart, effectiveWeeksToShow, emailDomain, fetchTeamData]);

  // Create a stable key for tracking when team members change
  const teamMemberIds = useMemo(() => teamMembers.map((m) => m.id).join(','), [teamMembers]);

  // Fetch profile photos when team members change
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
    // teamMemberIds is a derived key from teamMembers - using it avoids re-running when only photos update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMemberIds, updateMemberPhoto]);

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

  // Filter members by search and sort alphabetically
  const filteredMembers = useMemo(() => {
    const members = !searchQuery
      ? teamMembers
      : teamMembers.filter(
          (m) =>
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.number.toLowerCase().includes(searchQuery.toLowerCase())
        );
    return members.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [teamMembers, searchQuery]);

  // Filter projects by search and sort alphabetically
  const filteredProjects = useMemo(() => {
    const filtered = !searchQuery
      ? projects
      : projects.filter(
          (p) =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.allocations.some((a) =>
              a.resourceName.toLowerCase().includes(searchQuery.toLowerCase())
            )
        );
    return filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, searchQuery]);

  // Toggle expanded row (Team view)
  const toggleMemberExpanded = (memberId: string) => {
    setExpandedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  // Toggle expanded row (Projects view)
  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  // Open plan entry modal (Team view - select project for a resource)
  const handleOpenPlanModal = (
    member: PlanTeamMember,
    weekStart: Date,
    context?: AddPlanContext
  ) => {
    setSelectedMemberForPlan(member);
    setSelectedDateForPlan(weekStart);
    setPreSelectedProjectCode(context?.projectCode);
    setPreSelectedTeamTaskCode(context?.taskCode);
    setIsPlanModalOpen(true);
  };

  // Open plan entry modal (Projects view - select resource for a project)
  const handleOpenProjectPlanModal = (
    project: PlanProject,
    weekStart: Date,
    context?: AddPlanContext
  ) => {
    setSelectedProjectForPlan(project);
    setSelectedDateForPlan(weekStart);
    setPreSelectedTaskCode(context?.taskCode);
    setPreSelectedResourceNo(context?.resourceNo);
    setIsResourceModalOpen(true);
  };

  // Open edit modal for an allocation
  const handleOpenEditModal = (allocationId: string) => {
    // Find the allocation in team members or projects
    let allocation: AllocationBlock | null = null;

    // Search in team members
    for (const member of teamMembers) {
      const found = member.allocations.find((a) => a.id === allocationId);
      if (found) {
        allocation = found;
        break;
      }
    }

    // If not found, search in projects
    if (!allocation) {
      for (const project of projects) {
        const found = project.allocations.find((a) => a.id === allocationId);
        if (found) {
          allocation = found;
          break;
        }
      }
    }

    if (allocation) {
      setSelectedAllocationForEdit(allocation);
      setIsEditModalOpen(true);
    }
  };

  // Handle plan modal save - clear cache to refetch with new planning lines
  const handlePlanSaved = async () => {
    clearCache();
    await fetchTeamData(currentWeekStart, effectiveWeeksToShow, emailDomain);
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

  // Error state (only show if not loading)
  if (error && !isLoading && !extensionNotInstalled) {
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
    <div className={cn('space-y-4', isFullscreen && 'flex h-full flex-col')}>
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

          {/* Simple Week Navigation - just prev/next buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevious} title="Previous week">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={handleNext} title="Next week">
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
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

          {/* Fullscreen Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <ArrowsPointingInIcon className="h-5 w-5" />
            ) : (
              <ArrowsPointingOutIcon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card
        variant="bordered"
        className={cn('overflow-hidden', isFullscreen && 'flex flex-1 flex-col')}
      >
        {/* Header with week numbers and dates */}
        <div className="border-dark-700 bg-dark-800/50 flex w-full flex-col border-b">
          {/* Week numbers row */}
          <div className="flex w-full">
            {/* Sticky name column header spacer */}
            <div className="bg-dark-800/50 sticky left-0 z-10 flex shrink-0">
              <div className="w-[230px] shrink-0" />
            </div>
            <div className="flex flex-1">
              {headerWeekGroups.map((weekGroup, index) => (
                <div
                  key={weekGroup.weekStart.toISOString()}
                  className={cn(
                    'border-dark-700 relative flex flex-1 items-center justify-center border-l py-1',
                    index > 0 && 'border-l-2'
                  )}
                >
                  {/* Month at top left */}
                  <span className="text-dark-500 absolute left-1 text-[10px]">
                    {weekGroup.month}
                  </span>
                  {/* Week number centered */}
                  <span className="text-dark-300 text-xs font-medium">{weekGroup.weekNumber}</span>
                </div>
              ))}
            </div>
            <div className="text-dark-500 flex w-16 shrink-0 items-center justify-end px-2 text-[10px]">
              Total
            </div>
          </div>

          {/* Day names and numbers row */}
          <div className="flex w-full">
            {/* Sticky name column header spacer */}
            <div className="bg-dark-800/50 sticky left-0 z-10 flex shrink-0">
              <div className="w-[230px] shrink-0" />
            </div>
            <div className="flex flex-1">
              {allDays.map((day, index) => {
                const dayIsToday = isToday(day);
                const dayIsWeekend = isWeekend(day);
                const isWeekStart = day.getDay() === 1;
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'border-dark-700 flex flex-1 flex-col items-center justify-center border-l py-1',
                      dayIsWeekend && 'bg-dark-700/60',
                      dayIsToday && 'bg-knowall-green/10',
                      isWeekStart && index > 0 && 'border-l-2'
                    )}
                  >
                    <span
                      className={cn(
                        'text-[10px]',
                        dayIsWeekend ? 'text-dark-500' : 'text-dark-400'
                      )}
                    >
                      {format(day, 'EEE')}
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        dayIsToday
                          ? 'text-knowall-green'
                          : dayIsWeekend
                            ? 'text-dark-400'
                            : 'text-dark-200'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="w-16 shrink-0" />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-b-2"></div>
          </div>
        )}

        {/* Content */}
        {!isLoading && (
          <div className={cn('w-full', isFullscreen && 'flex-1 overflow-y-auto')}>
            {viewMode === 'team' ? (
              // Team View
              filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <ResourceRow
                    key={member.id}
                    member={member}
                    days={allDays}
                    selectedAllocationId={selectedAllocationId}
                    onSelectAllocation={selectAllocation}
                    onEditAllocation={handleOpenEditModal}
                    onDragStart={startDrag}
                    onDragEnd={endDrag}
                    onDrop={handleDrop}
                    isDragging={isDragging}
                    isExpanded={expandedMemberIds.has(member.id)}
                    onToggleExpand={() => toggleMemberExpanded(member.id)}
                    onAddPlan={(weekStart, context) =>
                      handleOpenPlanModal(member, weekStart, context)
                    }
                    companyName={selectedCompany?.name}
                  />
                ))
              ) : (
                <div className="text-dark-400 py-12 text-center">
                  <UserGroupIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
                  <p>{searchQuery ? 'No resources match your search' : 'No resources found'}</p>
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
                  onEditAllocation={handleOpenEditModal}
                  onDragStart={startDrag}
                  onDragEnd={endDrag}
                  isDragging={isDragging}
                  onAddPlan={(weekStart, context) =>
                    handleOpenProjectPlanModal(project, weekStart, context)
                  }
                  isExpanded={expandedProjectIds.has(project.id)}
                  onToggleExpand={() => toggleProjectExpanded(project.id)}
                  companyName={selectedCompany?.name}
                />
              ))
            ) : (
              <div className="text-dark-400 py-12 text-center">
                <FolderIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
                <p>{searchQuery ? 'No projects match your search' : 'No allocations found'}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-dark-400">Tip:</span>
        <span className="text-dark-300">Click hours to expand, then click allocation to edit</span>
        <span className="text-dark-300">Hover over week to add plan</span>
      </div>

      {/* Plan Entry Modal (Team view - select project for resource) */}
      {selectedMemberForPlan && (
        <PlanEntryModal
          isOpen={isPlanModalOpen}
          onClose={() => {
            setIsPlanModalOpen(false);
            setPreSelectedProjectCode(undefined);
            setPreSelectedTeamTaskCode(undefined);
          }}
          resourceNumber={selectedMemberForPlan.number}
          resourceName={selectedMemberForPlan.name}
          selectedDate={selectedDateForPlan}
          onSave={handlePlanSaved}
          preSelectedProjectCode={preSelectedProjectCode}
          preSelectedTaskCode={preSelectedTeamTaskCode}
        />
      )}

      {/* Plan Resource Modal (Projects view - select resource for project) */}
      {selectedProjectForPlan && (
        <PlanResourceModal
          isOpen={isResourceModalOpen}
          onClose={() => {
            setIsResourceModalOpen(false);
            setPreSelectedTaskCode(undefined);
            setPreSelectedResourceNo(undefined);
          }}
          projectNumber={selectedProjectForPlan.number}
          projectName={selectedProjectForPlan.name}
          selectedDate={selectedDateForPlan}
          onSave={handlePlanSaved}
          preSelectedTaskCode={preSelectedTaskCode}
          preSelectedResourceNo={preSelectedResourceNo}
        />
      )}

      {/* Edit Allocation Modal */}
      <PlanEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedAllocationForEdit(null);
        }}
        allocation={selectedAllocationForEdit}
        onSave={handlePlanSaved}
        onDelete={handlePlanSaved}
      />
    </div>
  );

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <ExtensionPreviewWrapper extensionNotInstalled={extensionNotInstalled} pageName="Plan">
        <div className="bg-dark-900 fixed inset-0 z-50 flex flex-col p-6">{planContent}</div>
      </ExtensionPreviewWrapper>
    );
  }

  return (
    <ExtensionPreviewWrapper extensionNotInstalled={extensionNotInstalled} pageName="Plan">
      {planContent}
    </ExtensionPreviewWrapper>
  );
}
