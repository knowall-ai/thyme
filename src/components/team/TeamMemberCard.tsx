'use client';

import { Card } from '@/components/ui';
import { formatTime } from '@/utils';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  hoursThisWeek: number;
  hoursTarget: number;
  status: 'on-track' | 'behind' | 'ahead';
}

interface TeamMemberCardProps {
  member: TeamMember;
}

export function TeamMemberCard({ member }: TeamMemberCardProps) {
  const progressPercent = Math.min((member.hoursThisWeek / member.hoursTarget) * 100, 100);

  const statusColors = {
    'on-track': 'bg-thyme-500',
    behind: 'bg-amber-500',
    ahead: 'bg-blue-500',
  };

  const statusLabels = {
    'on-track': 'On Track',
    behind: 'Behind',
    ahead: 'Ahead',
  };

  return (
    <Card variant="bordered" className="p-4">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {member.avatar ? (
            <img src={member.avatar} alt={member.name} className="h-12 w-12 rounded-full" />
          ) : (
            <div className="bg-dark-600 flex h-12 w-12 items-center justify-center rounded-full">
              <span className="text-dark-200 text-lg font-medium">
                {member.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-dark-100 truncate font-medium">{member.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${statusColors[member.status]} text-white`}
            >
              {statusLabels[member.status]}
            </span>
          </div>
          <p className="text-dark-400 truncate text-sm">{member.role}</p>

          {/* Progress */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-dark-400">This week</span>
              <span className="text-dark-200">
                {formatTime(member.hoursThisWeek)} / {formatTime(member.hoursTarget)}
              </span>
            </div>
            <div className="bg-dark-700 h-2 overflow-hidden rounded-full">
              <div
                className={`h-full ${statusColors[member.status]} transition-all duration-300`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
