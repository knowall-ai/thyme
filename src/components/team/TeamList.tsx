'use client';

import { useState, useEffect, useMemo } from 'react';
import { TeamMemberCard } from './TeamMemberCard';
import { Card } from '@/components/ui';
import { bcClient } from '@/services/bc/bcClient';
import { useSettingsStore } from '@/hooks/useSettingsStore';
import type { BCEmployee } from '@/types';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  hoursThisWeek: number;
  hoursTarget: number;
  status: 'on-track' | 'behind' | 'ahead';
}

function mapEmployeeToMember(employee: BCEmployee, hoursTarget: number): TeamMember {
  // TODO: Fetch actual hours from timeRegistrationEntries
  const hoursThisWeek = 0;

  let status: 'on-track' | 'behind' | 'ahead' = 'on-track';
  const progress = hoursTarget > 0 ? hoursThisWeek / hoursTarget : 0;
  if (progress < 0.6) status = 'behind';
  else if (progress > 1) status = 'ahead';

  return {
    id: employee.id,
    name: employee.displayName,
    email: employee.email || '',
    role: employee.jobTitle || 'Team Member',
    hoursThisWeek,
    hoursTarget,
    status,
  };
}

export function TeamList() {
  const { weeklyHoursTarget } = useSettingsStore();
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<BCEmployee[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const data = await bcClient.getEmployees("status eq 'Active'");
        setEmployees(data);
      } catch (err) {
        console.error('Failed to fetch employees:', err);
        setError('Failed to load team members');
      } finally {
        setIsLoading(false);
      }
    }
    fetchEmployees();
  }, []);

  // Derive members from employees when weeklyHoursTarget changes (no API refetch)
  const members = useMemo(
    () => employees.map((emp) => mapEmployeeToMember(emp, weeklyHoursTarget)),
    [employees, weeklyHoursTarget]
  );

  const totalHours = members.reduce((sum, m) => sum + m.hoursThisWeek, 0);
  const totalTarget = members.reduce((sum, m) => sum + m.hoursTarget, 0);
  const behindCount = members.filter((m) => m.status === 'behind').length;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-thyme-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-red-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-thyme-500 underline hover:text-thyme-400"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">Team Members</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">{members.length}</p>
        </Card>
        <Card variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">Total Hours This Week</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {totalHours} / {totalTarget}
          </p>
        </Card>
        <Card variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">Need Attention</p>
          <p className="mt-1 text-2xl font-bold text-amber-500">{behindCount}</p>
        </Card>
      </div>

      {/* Team Members */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {members.map((member) => (
          <TeamMemberCard key={member.id} member={member} />
        ))}
      </div>
    </div>
  );
}
