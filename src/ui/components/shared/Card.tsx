import type React from 'react';

/**
 * Card component props.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

/**
 * Reusable card component for content containers.
 */
export function Card({ interactive = false, className = '', children, ...props }: CardProps) {
  const interactiveClass = interactive ? 'ignite-card-interactive' : '';

  return (
    <div className={`ignite-card ${interactiveClass} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
