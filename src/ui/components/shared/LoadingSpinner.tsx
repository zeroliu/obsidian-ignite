/**
 * LoadingSpinner component props.
 */
export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Loading state indicator component.
 */
export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClass = `ignite-spinner-${size}`;

  return (
    <output className={`ignite-spinner ${sizeClass} ${className}`.trim()}>
      <div className="ignite-spinner-ring" />
      <span className="ignite-spinner-sr-only">Loading...</span>
    </output>
  );
}
