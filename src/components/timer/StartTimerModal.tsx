'use client';

import { useState, useEffect } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Modal, Button, Select } from '@/components/ui';
import { useTimer, useProjectsStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { bcClient } from '@/services/bc/bcClient';
import type { SelectOption } from '@/types';

interface StartTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StartTimerModal({ isOpen, onClose }: StartTimerModalProps) {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';

  const timer = useTimer(userId);
  const { projects, selectedProject, selectProject, selectTask } = useProjectsStore();

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [notes, setNotes] = useState('');
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);

  // Check if BC extension is installed
  useEffect(() => {
    if (isOpen) {
      bcClient.isExtensionInstalled().then(setExtensionInstalled);
    }
  }, [isOpen]);

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

  // Show extension required message if not installed
  if (extensionInstalled === false) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Start Timer">
        <div className="flex flex-col items-center py-6 text-center">
          <div className="mb-4 rounded-full bg-amber-500/10 p-3">
            <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-white">Extension Required</h3>
          <p className="mb-4 max-w-sm text-sm text-dark-300">
            The Thyme BC Extension is required to start a timer. It provides the project tasks
            needed by Business Central.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                window.open('https://github.com/knowall-ai/thyme-bc-extension', '_blank')
              }
            >
              Learn More
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

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
          <label htmlFor="timer-notes" className="mb-1 block text-sm font-medium text-dark-200">
            Notes (optional)
          </label>
          <textarea
            id="timer-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-dark-100 placeholder:text-dark-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-thyme-500"
            placeholder="What are you working on?"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-dark-700 pt-4">
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
