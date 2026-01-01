/**
 * AnswerOption component props.
 */
export interface AnswerOptionProps {
  option: string;
  index: number;
  isSelected: boolean;
  isCorrect?: boolean;
  isIncorrect?: boolean;
  disabled?: boolean;
  onSelect: (index: number) => void;
}

/**
 * Component for displaying a multiple-choice answer option.
 */
export function AnswerOption({
  option,
  index,
  isSelected,
  isCorrect,
  isIncorrect,
  disabled = false,
  onSelect,
}: AnswerOptionProps) {
  const optionLetter = String.fromCharCode(65 + index); // A, B, C, D

  const getClassName = () => {
    const classes = ['ignite-answer-option'];
    if (isSelected) classes.push('ignite-answer-option-selected');
    if (isCorrect) classes.push('ignite-answer-option-correct');
    if (isIncorrect) classes.push('ignite-answer-option-incorrect');
    if (disabled) classes.push('ignite-answer-option-disabled');
    return classes.join(' ');
  };

  const handleClick = () => {
    if (!disabled) {
      onSelect(index);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect(index);
    }
  };

  return (
    <button
      type="button"
      className={getClassName()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-pressed={isSelected}
    >
      <span className="ignite-answer-option-letter">{optionLetter}</span>
      <span className="ignite-answer-option-text">{option}</span>
      {isCorrect && <span className="ignite-answer-option-icon">&#10003;</span>}
      {isIncorrect && <span className="ignite-answer-option-icon">&#10007;</span>}
    </button>
  );
}
