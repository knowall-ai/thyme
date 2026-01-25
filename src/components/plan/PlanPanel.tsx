'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  CheckIcon,
  DocumentPlusIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Card, Button, WeekNavigation, ExtensionNotInstalled } from '@/components/ui';
import { usePlanStore } from '@/hooks';
import { useCompanyStore } from '@/hooks';
import { useAuth, getUserProfilePhoto } from '@/services/auth';
import { ExtensionNotInstalledError } from '@/services/bc';
import { getWeekStart, getWeekDays, formatDate } from '@/utils';
import { cn } from '@/utils';
import type { PlanTeamMember } from '@/hooks/usePlanStore';
import type { TimesheetDisplayStatus } from '@/types';

// Status color mapping
function getStatusColor(status: TimesheetDisplayStatus | 'No Timesheet'): string {
  switch (status) {
    case 'Open':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'Submitted':
    case 'Partially Submitted':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'Approved':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'Rejected':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'Mixed':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'No Timesheet':
    default:
      return 'bg-dark-600/50 text-dark-400 border-dark-500/30';
  }
}

// Status badge for calendar cell
function getStatusBadgeColor(status: TimesheetDisplayStatus | 'No Timesheet'): string {
  switch (status) {
    case 'Open':
      return 'bg-blue-500';
    case 'Submitted':
    case 'Partially Submitted':
      return 'bg-amber-500';
    case 'Approved':
      return 'bg-green-500';
    case 'Rejected':
      return 'bg-red-500';
    case 'Mixed':
      return 'bg-purple-500';
    case 'No Timesheet':
    default:
      return 'bg-dark-600';
  }
}

interface TeamMemberRowProps {
  member: PlanTeamMember;
  isSelected: boolean;
  onToggleSelect: () => void;
  weekDays: Date[];
}

function TeamMemberRow({ member, isSelected, onToggleSelect, weekDays }: TeamMemberRowProps) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
      <div className="flex min-w-[200px] items-center gap-3 py-3 pr-4">
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={member.name}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium',
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
        <div className="min-w-0">
          <p className="text-dark-100 truncate font-medium">{member.name}</p>
          <p className="text-dark-400 truncate text-xs">{member.number}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="w-32 shrink-0 px-2">
        <span
          className={cn(
            'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
            getStatusColor(member.timesheetStatus)
          )}
        >
          {member.timesheetStatus}
        </span>
      </div>

      {/* Week Calendar Cells */}
      <div className="flex flex-1 items-center">
        {weekDays.map((day) => {
          const isToday = formatDate(day) === formatDate(new Date());
          const hasTimesheet = member.timesheetStatus !== 'No Timesheet';

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'border-dark-700 flex h-12 flex-1 items-center justify-center border-l',
                isToday && 'bg-knowall-green/5'
              )}
            >
              {hasTimesheet && (
                <div
                  className={cn(
                    'h-6 w-6 rounded',
                    getStatusBadgeColor(member.timesheetStatus),
                    'opacity-60'
                  )}
                  title={`${member.timesheetStatus} - ${member.totalHours}h total`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Total Hours */}
      <div className="text-dark-300 w-20 shrink-0 px-4 text-right text-sm">
        {member.totalHours > 0 ? `${member.totalHours.toFixed(1)}h` : '-'}
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
    isLoading,
    isCreatingTimesheets,
    error,
    selectedMemberIds,
    fetchTeamMembers,
    setCurrentWeekStart,
    toggleMemberSelection,
    selectAllWithoutTimesheet,
    clearSelection,
    createTimesheetsForSelected,
    updateMemberPhoto,
  } = usePlanStore();

  const [currentWeekStart, setLocalWeekStart] = useState(() => getWeekStart(new Date()));
  const [searchQuery, setSearchQuery] = useState('');
  const [extensionNotInstalled, setExtensionNotInstalled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Week days for calendar header
  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart]);

  // Navigation handlers
  const handlePrevious = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setLocalWeekStart(newDate);
    setCurrentWeekStart(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setLocalWeekStart(newDate);
    setCurrentWeekStart(newDate);
  };

  const handleToday = () => {
    const today = getWeekStart(new Date());
    setLocalWeekStart(today);
    setCurrentWeekStart(today);
  };

  const handleDateSelect = (date: Date) => {
    const weekStart = getWeekStart(date);
    setLocalWeekStart(weekStart);
    setCurrentWeekStart(weekStart);
  };

  // Fetch team members when company or week changes
  useEffect(() => {
    async function loadData() {
      setExtensionNotInstalled(false);
      try {
        await fetchTeamMembers(currentWeekStart, emailDomain);
      } catch (err) {
        if (err instanceof ExtensionNotInstalledError) {
          setExtensionNotInstalled(true);
        }
      }
    }
    loadData();
  }, [selectedCompany, currentWeekStart, emailDomain, fetchTeamMembers]);

  // Fetch profile photos after members are loaded
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
  }, [teamMembers.length, updateMemberPhoto]); // Only re-run when member count changes

  // Filter members by search
  const filteredMembers = useMemo(() => {
    if (!searchQuery) return teamMembers;
    const query = searchQuery.toLowerCase();
    return teamMembers.filter(
      (m) => m.name.toLowerCase().includes(query) || m.number.toLowerCase().includes(query)
    );
  }, [teamMembers, searchQuery]);

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

    // Refresh data
    await fetchTeamMembers(currentWeekStart, emailDomain);
  };

  // Handle ESC key to close fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Extension not installed
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
            onClick={() => fetchTeamMembers(currentWeekStart, emailDomain)}
            className="text-knowall-green hover:text-knowall-green-light underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Content to render (shared between normal and fullscreen modes)
  const planContent = (
    <div className={cn('space-y-6', isFullscreen && 'flex h-full flex-col')}>
      {/* Header with Week Navigation and Fullscreen Toggle */}
      <div className="flex items-center justify-between gap-4">
        <WeekNavigation
          currentWeekStart={currentWeekStart}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onToday={handleToday}
          onDateSelect={handleDateSelect}
        />
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

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="relative min-w-[250px] flex-1">
          <MagnifyingGlassIcon className="text-dark-400 absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-dark-600 bg-dark-800 text-dark-100 placeholder:text-dark-500 focus:border-knowall-green focus:ring-knowall-green w-full rounded-lg border py-2 pr-4 pl-10 focus:ring-1 focus:outline-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {membersWithoutTimesheet > 0 && (
            <Button variant="outline" size="sm" onClick={selectAllWithoutTimesheet}>
              <DocumentPlusIcon className="mr-2 h-4 w-4" />
              Select All Without Timesheet ({membersWithoutTimesheet})
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
      </div>

      {/* Team Calendar Grid */}
      <Card
        variant="bordered"
        className={cn('overflow-hidden', isFullscreen && 'flex flex-1 flex-col')}
      >
        {/* Header */}
        <div className="border-dark-700 bg-dark-800/50 flex border-b">
          {/* Checkbox column */}
          <div className="w-10 shrink-0" />

          {/* Name column */}
          <div className="text-dark-300 min-w-[200px] py-3 pr-4 text-sm font-medium">Resource</div>

          {/* Status column */}
          <div className="text-dark-300 w-32 shrink-0 px-2 py-3 text-sm font-medium">Status</div>

          {/* Week days */}
          <div className="flex flex-1">
            {weekDays.map((day) => {
              const isToday = formatDate(day) === formatDate(new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-dark-700 flex flex-1 flex-col items-center justify-center border-l py-2',
                    isToday && 'bg-knowall-green/10'
                  )}
                >
                  <span className="text-dark-400 text-xs">{formatDate(day, 'EEE')}</span>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isToday ? 'text-knowall-green' : 'text-dark-200'
                    )}
                  >
                    {formatDate(day, 'd')}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Total hours column */}
          <div className="text-dark-300 w-20 shrink-0 px-4 py-3 text-right text-sm font-medium">
            Hours
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-b-2"></div>
          </div>
        )}

        {/* Team Members */}
        {!isLoading && (
          <div className={cn('overflow-y-auto', isFullscreen ? 'flex-1' : 'max-h-[600px]')}>
            {filteredMembers.map((member) => (
              <TeamMemberRow
                key={member.id}
                member={member}
                isSelected={selectedMemberIds.includes(member.id)}
                onToggleSelect={() => toggleMemberSelection(member.id)}
                weekDays={weekDays}
              />
            ))}

            {filteredMembers.length === 0 && (
              <div className="text-dark-400 py-12 text-center">
                {searchQuery ? 'No resources match your search' : 'No resources found'}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-dark-400">Status:</span>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-500/50" />
          <span className="text-dark-300">? = No Timesheet</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-dark-300">Open</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-500" />
          <span className="text-dark-300">Submitted</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-green-500" />
          <span className="text-dark-300">Approved</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-dark-300">Rejected</span>
        </div>
      </div>
    </div>
  );

  // Fullscreen mode - render as overlay
  if (isFullscreen) {
    return <div className="bg-dark-900 fixed inset-0 z-50 flex flex-col p-6">{planContent}</div>;
  }

  return planContent;
}
