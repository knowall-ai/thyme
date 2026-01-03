'use client';

import { useState, useEffect } from 'react';
import { TeamMemberCard } from './TeamMemberCard';
import { Card } from '@/components/ui';

// Mock data - would come from BC API in production
const mockTeamMembers = [
  {
    id: '1',
    name: 'Ben Weeks',
    email: 'ben@knowall.ai',
    role: 'Developer',
    hoursThisWeek: 32,
    hoursTarget: 40,
    status: 'on-track' as const,
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    email: 'sarah@knowall.ai',
    role: 'Project Manager',
    hoursThisWeek: 38,
    hoursTarget: 40,
    status: 'on-track' as const,
  },
  {
    id: '3',
    name: 'Mike Chen',
    email: 'mike@knowall.ai',
    role: 'Designer',
    hoursThisWeek: 24,
    hoursTarget: 40,
    status: 'behind' as const,
  },
  {
    id: '4',
    name: 'Emma Wilson',
    email: 'emma@knowall.ai',
    role: 'Developer',
    hoursThisWeek: 42,
    hoursTarget: 40,
    status: 'ahead' as const,
  },
];

export function TeamList() {
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState(mockTeamMembers);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
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
