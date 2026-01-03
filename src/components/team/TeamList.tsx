'use client';

import { useState, useEffect } from 'react';
import { TeamMemberCard } from './TeamMemberCard';
import { Card } from '@/components/ui';
import { bcClient } from '@/services/bc/bcClient';
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

function mapEmployeeToMember(employee: BCEmployee): TeamMember {
  // TODO: Fetch actual hours from timeRegistrationEntries
  const hoursThisWeek = 0;
  const hoursTarget = 40;

  let status: 'on-track' | 'behind' | 'ahead' = 'on-track';
  const progress = hoursThisWeek / hoursTarget;
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
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const employees = await bcClient.getEmployees("status eq 'Active'");
        const teamMembers = employees.map(mapEmployeeToMember);
        setMembers(teamMembers);
      } catch (err) {
        console.error('Failed to fetch employees:', err);
        setError('Failed to load team members');
      } finally {
        setIsLoading(false);
      }
    }
    fetchEmployees();
  }, []);

  const totalHours = members.reduce((sum, m) => sum + m.hoursThisWeek, 0);
  const totalTarget = members.reduce((sum, m) => sum + m.hoursTarget, 0);
  const behindCount = members.filter(m => m.status === 'behind').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-thyme-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-thyme-500 hover:text-thyme-400 underline"
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">Team Members</p>
          <p className="text-2xl font-bold text-dark-100 mt-1">{members.length}</p>
        </Card>
        <Card variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">Total Hours This Week</p>
          <p className="text-2xl font-bold text-dark-100 mt-1">
            {totalHours} / {totalTarget}
          </p>
        </Card>
        <Card variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">Need Attention</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{behindCount}</p>
        </Card>
      </div>

      {/* Team Members */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.map((member) => (
          <TeamMemberCard key={member.id} member={member} />
        ))}
      </div>
    </div>
  );
}
