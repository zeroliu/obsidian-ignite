import { Button } from '@/ui/components/shared/Button';
import { useState } from 'react';

/**
 * OpenEndedInput component props.
 */
export interface OpenEndedInputProps {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Component for open-ended answer input.
 */
export function OpenEndedInput({
  onSubmit,
  disabled = false,
  placeholder = 'Type your answer...',
}: OpenEndedInputProps) {
  const [answer, setAnswer] = useState('');

  const handleSubmit = () => {
    if (answer.trim()) {
      onSubmit(answer.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="ignite-open-ended-input">
      <textarea
        className="ignite-open-ended-textarea"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={6}
        aria-label="Your answer"
      />
      <div className="ignite-open-ended-footer">
        <span className="ignite-open-ended-hint">Press Ctrl+Enter to submit</span>
        <Button variant="primary" onClick={handleSubmit} disabled={disabled || !answer.trim()}>
          Submit Answer
        </Button>
      </div>
    </div>
  );
}
