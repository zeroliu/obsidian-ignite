import { Card } from '../shared/Card';

/**
 * Sources card props.
 */
export interface SourcesCardProps {
  sources: string[];
}

/**
 * Component for displaying note references.
 */
export function SourcesCard({ sources }: SourcesCardProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <Card className="ignite-sources-card">
      <div className="ignite-sources-card-header">Sources Referenced</div>
      <ul className="ignite-sources-card-list">
        {sources.map((source) => (
          <li key={source} className="ignite-sources-card-item">
            {source}
          </li>
        ))}
      </ul>
    </Card>
  );
}
