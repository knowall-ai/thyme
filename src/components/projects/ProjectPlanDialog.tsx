'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui';
import { PlanPanel } from '@/components/plan';

interface ProjectPlanDialogProps {
  projectCode: string;
  onClose: () => void;
  /** Called on close if a plan was added, edited or deleted, so the page can refresh */
  onPlanChanged: () => void;
}

// The Plan tab's grid, scoped to one project, behind the Planned card's "+N more"
export function ProjectPlanDialog({ projectCode, onClose, onPlanChanged }: ProjectPlanDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Refresh the page once on close rather than after every edit
  const planChanged = useRef(false);

  const handleClose = () => {
    onClose();
    if (planChanged.current) onPlanChanged();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title={`Plan: ${projectCode}`}
      size={isFullscreen ? 'full' : '2xl'}
      className="print:hidden"
    >
      <PlanPanel
        projectCode={projectCode}
        isFullscreen={isFullscreen}
        onFullscreenChange={setIsFullscreen}
        onPlanChanged={() => {
          planChanged.current = true;
        }}
      />
    </Modal>
  );
}
