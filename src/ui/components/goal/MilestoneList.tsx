import type React from 'react';

import type { Milestone } from '@/domain/goal/types';

/**
 * MilestoneList component props.
 */
export interface MilestoneListProps {
  milestones: Milestone[];
  onToggle?: (milestoneId: string) => void;
  readonly?: boolean;
}

/**
 * Editable milestone list with checkbox toggles.
 */
export function MilestoneList({ milestones, onToggle, readonly = false }: MilestoneListProps) {
  const sortedMilestones = [...milestones].sort((a, b) => a.order - b.order);

  const handleToggle = (milestoneId: string) => {
    if (!readonly && onToggle) {
      onToggle(milestoneId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, milestoneId: string) => {
    if ((e.key === 'Enter' || e.key === ' ') && !readonly && onToggle) {
      e.preventDefault();
      handleToggle(milestoneId);
    }
  };

  return (
    <div className="ignite-milestone-list">
      {sortedMilestones.length === 0 ? (
        <p className="ignite-milestone-list-empty">No milestones defined</p>
      ) : (
        <ul className="ignite-milestone-list-items">
          {sortedMilestones.map((milestone) => (
            <li key={milestone.id} className="ignite-milestone-item">
              <label className="ignite-milestone-label">
                <input
                  type="checkbox"
                  checked={milestone.completed}
                  onChange={() => handleToggle(milestone.id)}
                  onKeyDown={(e) => handleKeyDown(e, milestone.id)}
                  disabled={readonly}
                  className="ignite-milestone-checkbox"
                />
                <span
                  className={`ignite-milestone-content ${milestone.completed ? 'ignite-milestone-content-completed' : ''}`}
                >
                  {milestone.content}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
