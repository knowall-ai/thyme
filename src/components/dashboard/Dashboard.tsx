'use client';

import { useState } from 'react';
import { Layout } from '@/components/layout';
import { WeeklyTimesheet } from '@/components/timesheet';
import { TimerDisplay, StartTimerModal } from '@/components/timer';

export function Dashboard() {
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Timesheet</h1>
            <p className="text-dark-400 mt-1">Track your time and sync to Business Central</p>
          </div>

          {/* Timer */}
          <TimerDisplay onStartTimer={() => setIsTimerModalOpen(true)} />
        </div>

        {/* Weekly Timesheet */}
        <WeeklyTimesheet />
      </div>

      {/* Start Timer Modal */}
      <StartTimerModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
      />
    </Layout>
  );
}
