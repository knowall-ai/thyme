'use client';

import { useState, useEffect } from 'react';
import { Modal, Button, Select } from '@/components/ui';
import { useTimer, useProjectsStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import type { SelectOption } from '@/types';

interface StartTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StartTimerModal({ isOpen, onClose }: StartTimerModalProps) {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';

  const timer = useTimer(userId);
  const { projects, selectedProject, selectProject, selectTask } =
    useProjectsStore();

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [notes, setNotes] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setProjectId(selectedProject?.id || '');
      setTaskId('');
      setNotes('');
    }
  }, [isOpen, selectedProject]);

  const projectOptions: SelectOption[] = projects.map((p) => ({
    value: p.id,
    label: `${p.code} - ${p.name}`,
  }));

  const taskOptions: SelectOption[] =
    projects
      .find((p) => p.id === projectId)
      ?.tasks.map((t) => ({
        value: t.id,
        label: t.name,
      })) || [];

  const handleProjectChange = (value: string) => {
    setProjectId(value);
    setTaskId('');
    const project = projects.find((p) => p.id === value);
    selectProject(project || null);
  };

  const handleTaskChange = (value: string) => {
    setTaskId(value);
    const project = projects.find((p) => p.id === projectId);
    const task = project?.tasks.find((t) => t.id === value);
    selectTask(task || null);
  };

  const handleStart = () => {
    if (!projectId || !taskId) return;
    timer.start(projectId, taskId, notes || undefined);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start Timer">
      <div className="space-y-4">
        {/* Project */}
        <Select
          label="Project"
          options={projectOptions}
          value={projectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          placeholder="Select a project"
        />

        {/* Task */}
        <Select
          label="Task"
          options={taskOptions}
          value={taskId}
          onChange={(e) => handleTaskChange(e.target.value)}
          placeholder="Select a task"
          disabled={!projectId || taskOptions.length === 0}
        />

        {/* Notes */}
        <div>
          <label
            htmlFor="timer-notes"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Notes (optional)
          </label>
          <textarea
            id="timer-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-thyme-500 focus:border-transparent"
            placeholder="What are you working on?"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={!projectId || !taskId}>
            Start Timer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
