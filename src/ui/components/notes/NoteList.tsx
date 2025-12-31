import type { ScoredNote } from '@/domain/goal/NoteRelevanceService';
import { Button } from '../shared/Button';
import { NoteCard } from './NoteCard';

/**
 * Note list props.
 */
export interface NoteListProps {
  notes: ScoredNote[];
  selectedPaths: string[];
  onToggle: (path: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

/**
 * Selectable note list with multi-select controls.
 */
export function NoteList({
  notes,
  selectedPaths,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: NoteListProps) {
  const selectedSet = new Set(selectedPaths);

  return (
    <div className="ignite-note-list">
      <div className="ignite-note-list-header">
        <div className="ignite-note-list-count">
          {selectedPaths.length} of {notes.length} selected
        </div>
        <div className="ignite-note-list-actions">
          <Button variant="secondary" onClick={onSelectAll}>
            Select All
          </Button>
          <Button variant="secondary" onClick={onDeselectAll}>
            Deselect All
          </Button>
        </div>
      </div>
      <div className="ignite-note-list-items">
        {notes.map((note) => (
          <NoteCard
            key={note.path}
            path={note.path}
            score={note.score}
            reason={note.reason}
            selected={selectedSet.has(note.path)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
