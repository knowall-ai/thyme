'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
  FolderIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline';
import { Card, Button, ExtensionNotInstalled } from '@/components/ui';
import { PlanEntryModal } from './PlanEntryModal';
import { PlanResourceModal } from './PlanResourceModal';
import { usePlanStore } from '@/hooks';
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
  getWeek,
  isSameDay,
  isToday,
  isWeekend,
} from 'date-fns';

// Day width is now dynamic based on available space

// Allocation Block Component
interface AllocationBlockProps {
  allocation: AllocationBlock;
  days: Date[];
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function AllocationBlockComponent({
  allocation,
  days,
  isSelected,
  onSelect,
  onDragStart,
  onDragEnd,
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

  // Calculate position and width as percentages
  const totalDays = days.length;
  const effectiveStartIndex = startIndex === -1 ? 0 : startIndex;
  const effectiveEndIndex = endIndex === -1 ? totalDays - 1 : endIndex;
  const leftPercent = (effectiveStartIndex / totalDays) * 100;
  const widthPercent = ((effectiveEndIndex - effectiveStartIndex + 1) / totalDays) * 100;

  return (
    <div
      className={cn(
        'absolute top-1 h-8 cursor-pointer rounded px-2 text-xs font-medium text-white shadow transition-all',
        isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-transparent'
      )}
      style={{
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
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

// Resource Row Component with expandable allocations
interface ResourceRowProps {
  member: PlanTeamMember;
  days: Date[];
  selectedAllocationId: string | null;
  onSelectAllocation: (id: string | null) => void;
  onDragStart: (allocation: AllocationBlock) => void;
  onDragEnd: () => void;
  onDrop: (date: string) => void;
  isDragging: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAddPlan: (weekStart: Date) => void;
}

function ResourceRow({
  member,
  days,
  selectedAllocationId,
  onSelectAllocation,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging,
  isExpanded,
  onToggleExpand,
  onAddPlan,
}: ResourceRowProps) {
  const [hoveredWeekStart, setHoveredWeekStart] = useState<Date | null>(null);

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
            'bg-dark-900 sticky left-0 z-10 flex shrink-0 items-center',
            isExpanded && 'bg-dark-800/30'
          )}
        >
          {/* Avatar and Name - clickable to expand */}
          <div
            className="flex w-[230px] cursor-pointer items-center gap-2 overflow-hidden py-2 px-3"
            onClick={onToggleExpand}
            title={member.name}
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
                member.timesheetStatus === 'No Timesheet' ? 'No timesheet for this week' : undefined
              }
            >
              {member.timesheetStatus === 'No Timesheet' ? '?' : initials}
            </div>
          )}
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-dark-500 truncate text-[10px]">{member.number}</p>
            <p className="text-dark-100 truncate text-sm font-medium leading-tight">{member.name}</p>
          </div>
          </div>
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
                    {/* Daily hours indicator - full width cell */}
                    {dayHours > 0 && (
                      <div className="bg-knowall-green/90 text-dark-950 absolute inset-0.5 flex items-center justify-center rounded text-xs font-semibold">
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
                    className="absolute inset-1 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed border-dark-600 text-xs text-dark-500 opacity-0 transition-all group-hover:opacity-100 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green"
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

      {/* Expanded Content: Allocations list */}
      {isExpanded && (
        <div className="bg-dark-850 border-dark-700 border-t">
          {/* Existing allocations */}
          {member.allocations.map((allocation) => {
            const allocationLabel = allocation.taskName
              ? `${allocation.projectName} - ${allocation.taskName}`
              : allocation.projectName;
            return (
              <div
                key={allocation.id}
                className="hover:bg-dark-700/60 flex w-full items-center"
              >
                {/* Sticky name column - matching parent structure */}
                <div className="bg-dark-850 sticky left-0 z-10 flex shrink-0">
                  <div
                    className="flex w-[230px] items-center gap-2 overflow-hidden py-1.5 pr-4 pl-12"
                    title={allocationLabel}
                  >
                    <div
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: allocation.color }}
                    />
                    <span className="text-dark-300 truncate text-xs">
                      {allocation.projectName}
                      {allocation.taskName && (
                        <span className="text-dark-500"> - {allocation.taskName}</span>
                      )}
                    </span>
                  </div>
                </div>
                {/* Day cells - showing hours for this allocation */}
                <div className="flex flex-1" style={{ minHeight: '28px' }}>
                  {days.map((day) => {
                    const dayIsToday = isToday(day);
                    const dayIsWeekend = isWeekend(day);
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const hasAllocation = allocation.startDate === dayStr;
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'border-dark-700 relative h-7 flex-1 border-l',
                          dayIsWeekend && 'bg-dark-700/60',
                          dayIsToday && 'bg-knowall-green/5'
                        )}
                      >
                        {/* Show hours pill if this allocation is on this day - full width */}
                        {hasAllocation && (
                          <div
                            className="absolute inset-0.5 flex items-center justify-center rounded text-[10px] font-semibold text-white"
                            style={{ backgroundColor: allocation.color }}
                          >
                            {allocation.hoursPerDay % 1 === 0
                              ? allocation.hoursPerDay
                              : allocation.hoursPerDay.toFixed(1)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Total hours */}
                <div className="text-dark-400 w-16 shrink-0 px-2 text-right text-xs">
                  {allocation.totalHours.toFixed(1)}h
                </div>
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
                      className="absolute inset-0.5 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed border-dark-600 text-[10px] text-dark-500 opacity-0 transition-all group-hover:opacity-100 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green"
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

// Project Row Component (for Projects view)
interface ProjectRowProps {
  project: PlanProject;
  days: Date[];
  selectedAllocationId: string | null;
  onSelectAllocation: (id: string | null) => void;
  onDragStart: (allocation: AllocationBlock) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onAddPlan: (weekStart: Date) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function ProjectRow({
  project,
  days,
  selectedAllocationId,
  onSelectAllocation,
  onDragStart,
  onDragEnd,
  isDragging,
  onAddPlan,
  isExpanded,
  onToggleExpand,
}: ProjectRowProps) {
  const [hoveredWeekStart, setHoveredWeekStart] = useState<Date | null>(null);

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
            'bg-dark-900 sticky left-0 z-10 flex shrink-0 items-center',
            isExpanded && 'bg-dark-800/30'
          )}
        >
          <div
            className="flex w-[230px] cursor-pointer items-center gap-2 overflow-hidden py-2 px-3"
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
              <p className="text-dark-100 truncate text-sm font-medium leading-tight">{project.name}</p>
            </div>
          </div>
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
                    className="absolute inset-1 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed border-dark-600 text-xs text-dark-500 opacity-0 transition-all group-hover:opacity-100 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green"
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

      {/* Expanded Content: Resources list */}
      {isExpanded && (
        <div className="bg-dark-850 border-dark-700 border-t">
          {/* Resources under this project */}
          {Array.from(allocationsByResource.entries()).map(([resourceNumber, allocations]) => (
            <div key={resourceNumber} className="hover:bg-dark-700/60 flex w-full items-center">
              {/* Sticky name column */}
              <div className="bg-dark-850 sticky left-0 z-10 flex shrink-0">
                <div
                  className="flex w-[230px] items-center gap-2 overflow-hidden py-1.5 pr-4 pl-12"
                  title={allocations[0].resourceName}
                >
                  <span className="text-dark-300 truncate text-xs">
                    {allocations[0].resourceName}
                  </span>
                </div>
              </div>
              {/* Day cells - showing hours for this resource */}
              <div className="flex flex-1" style={{ minHeight: '28px' }}>
                {days.map((day) => {
                  const dayIsToday = isToday(day);
                  const dayIsWeekend = isWeekend(day);
                  const dayStr = format(day, 'yyyy-MM-dd');
                  // Get hours for this resource on this day
                  const dayHours = allocations
                    .filter((a) => a.startDate === dayStr)
                    .reduce((sum, a) => sum + a.hoursPerDay, 0);
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        'border-dark-700 relative h-7 flex-1 border-l',
                        dayIsWeekend && 'bg-dark-700/60',
                        dayIsToday && 'bg-knowall-green/5'
                      )}
                    >
                      {/* Show hours pill if this resource has hours on this day */}
                      {dayHours > 0 && (
                        <div
                          className="absolute inset-0.5 flex items-center justify-center rounded text-[10px] font-semibold text-white"
                          style={{ backgroundColor: project.color }}
                        >
                          {dayHours % 1 === 0 ? dayHours : dayHours.toFixed(1)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Total hours */}
              <div className="text-dark-400 w-16 shrink-0 px-2 text-right text-xs">
                {allocations.reduce((sum, a) => sum + a.totalHours, 0).toFixed(1)}h
              </div>
            </div>
          ))}

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
                      className="absolute inset-0.5 z-10 flex items-center justify-center gap-1 rounded-md border-2 border-dashed border-dark-600 text-[10px] text-dark-500 opacity-0 transition-all group-hover:opacity-100 hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green"
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
  const { selectedCompany } = useCompanyStore();
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
    setCurrentWeekStart,
    setViewMode,
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
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  // Modal state for adding plans (Team view)
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [selectedMemberForPlan, setSelectedMemberForPlan] = useState<PlanTeamMember | null>(null);
  const [selectedDateForPlan, setSelectedDateForPlan] = useState<Date>(new Date());

  // Modal state for adding plans (Projects view)
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [selectedProjectForPlan, setSelectedProjectForPlan] = useState<PlanProject | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

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
    let currentGroup: { weekStart: Date; weekNumber: number; month: string; days: Date[] } | null = null;

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

  // Create a stable key for tracking when team members change
  const teamMemberIds = useMemo(
    () => teamMembers.map((m) => m.id).join(','),
    [teamMembers]
  );

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
  }, [teamMemberIds, teamMembers, updateMemberPhoto]);

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
  const handleOpenPlanModal = (member: PlanTeamMember, weekStart: Date) => {
    setSelectedMemberForPlan(member);
    setSelectedDateForPlan(weekStart);
    setIsPlanModalOpen(true);
  };

  // Open plan entry modal (Projects view - select resource for a project)
  const handleOpenProjectPlanModal = (project: PlanProject, weekStart: Date) => {
    setSelectedProjectForPlan(project);
    setSelectedDateForPlan(weekStart);
    setIsResourceModalOpen(true);
  };

  // Handle plan modal save
  const handlePlanSaved = async () => {
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

  // Error/loading states
  if (extensionNotInstalled) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevious}>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
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
              <XMarkIcon className="h-5 w-5" />
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
                  <span className="text-dark-300 text-xs font-medium">
                    {weekGroup.weekNumber}
                  </span>
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
                    <span className={cn('text-[10px]', dayIsWeekend ? 'text-dark-500' : 'text-dark-400')}>
                      {format(day, 'EEE')}
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        dayIsToday ? 'text-knowall-green' : dayIsWeekend ? 'text-dark-400' : 'text-dark-200'
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
                    onDragStart={startDrag}
                    onDragEnd={endDrag}
                    onDrop={handleDrop}
                    isDragging={isDragging}
                    isExpanded={expandedMemberIds.has(member.id)}
                    onToggleExpand={() => toggleMemberExpanded(member.id)}
                    onAddPlan={(weekStart) => handleOpenPlanModal(member, weekStart)}
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
                  onAddPlan={(weekStart) => handleOpenProjectPlanModal(project, weekStart)}
                  isExpanded={expandedProjectIds.has(project.id)}
                  onToggleExpand={() => toggleProjectExpanded(project.id)}
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
        <span className="text-dark-300">Hover over week to add plan</span>
      </div>

      {/* Plan Entry Modal (Team view - select project for resource) */}
      {selectedMemberForPlan && (
        <PlanEntryModal
          isOpen={isPlanModalOpen}
          onClose={() => setIsPlanModalOpen(false)}
          resourceNumber={selectedMemberForPlan.number}
          resourceName={selectedMemberForPlan.name}
          selectedDate={selectedDateForPlan}
          onSave={handlePlanSaved}
        />
      )}

      {/* Plan Resource Modal (Projects view - select resource for project) */}
      {selectedProjectForPlan && (
        <PlanResourceModal
          isOpen={isResourceModalOpen}
          onClose={() => setIsResourceModalOpen(false)}
          projectNumber={selectedProjectForPlan.number}
          projectName={selectedProjectForPlan.name}
          selectedDate={selectedDateForPlan}
          onSave={handlePlanSaved}
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
