/**
 * ProgressBar component props.
 */
export interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

/**
 * Visual progress indicator component.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  className = '',
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const percentageText = `${Math.round(percentage)}%`;

  return (
    <div className={`ignite-progress-container ${className}`.trim()}>
      {(label || showPercentage) && (
        <div className="ignite-progress-header">
          {label && <span className="ignite-progress-label">{label}</span>}
          {showPercentage && <span className="ignite-progress-percentage">{percentageText}</span>}
        </div>
      )}
      <div className="ignite-progress-bar" aria-label={label || 'Progress'}>
        <div className="ignite-progress-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
