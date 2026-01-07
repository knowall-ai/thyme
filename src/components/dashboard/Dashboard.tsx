'use client';

import { useState } from 'react';
import { Layout } from '@/components/layout';
import { WeeklyTimesheet, TeammateSelector } from '@/components/timesheet';
import { TimerDisplay, StartTimerModal } from '@/components/timer';
import { TeamsBotBanner } from '@/components/ui';
import { useTeammateStore } from '@/hooks';

export function Dashboard() {
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const { selectedTeammate } = useTeammateStore();
  const isViewingTeammate = selectedTeammate !== null;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Teams Bot Promo */}
        <TeamsBotBanner />

        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Timesheet</h1>
              <p className="mt-1 text-dark-400">
                {isViewingTeammate
                  ? `Viewing ${selectedTeammate.displayName}'s timesheet`
                  : 'Track your time and sync to Business Central'}
              </p>
            </div>
            <TeammateSelector />
          </div>

          {/* Timer - only show when viewing own timesheet */}
          {!isViewingTeammate && <TimerDisplay onStartTimer={() => setIsTimerModalOpen(true)} />}
        </div>

        {/* Weekly Timesheet */}
        <WeeklyTimesheet />
      </div>

      {/* Start Timer Modal */}
      <StartTimerModal isOpen={isTimerModalOpen} onClose={() => setIsTimerModalOpen(false)} />
    </Layout>
  );
}
