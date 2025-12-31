import type React from 'react';

/**
 * Input component props.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

/**
 * Reusable input component with label and error states.
 */
export function Input({
  label,
  error,
  fullWidth = false,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || `ignite-input-${Math.random().toString(36).substring(7)}`;
  const widthClass = fullWidth ? 'ignite-input-full-width' : '';
  const errorClass = error ? 'ignite-input-error' : '';

  return (
    <div className={`ignite-input-container ${widthClass}`.trim()}>
      {label && (
        <label htmlFor={inputId} className="ignite-input-label">
          {label}
        </label>
      )}
      <input id={inputId} className={`ignite-input ${errorClass} ${className}`.trim()} {...props} />
      {error && <div className="ignite-input-error-message">{error}</div>}
    </div>
  );
}
