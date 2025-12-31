import type React from 'react';

/**
 * Button variants for different contexts.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

/**
 * Button component props.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

/**
 * Reusable button component with variants.
 */
export function Button({
  variant = 'secondary',
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const variantClass = `ignite-button-${variant}`;
  const widthClass = fullWidth ? 'ignite-button-full-width' : '';

  return (
    <button
      className={`ignite-button ${variantClass} ${widthClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
