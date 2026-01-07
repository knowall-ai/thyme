'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { TeamMemberCard } from './TeamMemberCard';
import { Card } from '@/components/ui';
import { bcClient } from '@/services/bc/bcClient';
import { useCompanyStore } from '@/hooks';
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
  const { selectedCompany } = useCompanyStore();
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch employees when selected company changes
  useEffect(() => {
    async function fetchEmployees() {
      setIsLoading(true);
      setError(null);
      try {
        const employees = await bcClient.getEmployees("status eq 'Active'");
        const teamMembers = employees.map(mapEmployeeToMember);
        setMembers(teamMembers);
      } catch {
        setError('Failed to load team members');
        toast.error('Failed to load team members. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchEmployees();
  }, [selectedCompany]);

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
