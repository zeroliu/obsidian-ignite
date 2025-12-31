/**
 * ActionCard component props.
 */
export interface ActionCardProps {
  title: string;
  description: string;
  icon: string;
  onClick: () => void;
}

/**
 * Action button card for Discuss/Q&A actions.
 */
export function ActionCard({ title, description, icon, onClick }: ActionCardProps) {
  return (
    <button type="button" className="ignite-action-card" onClick={onClick}>
      <div className="ignite-action-card-icon">{icon}</div>
      <div className="ignite-action-card-content">
        <h4 className="ignite-action-card-title">{title}</h4>
        <p className="ignite-action-card-description">{description}</p>
      </div>
    </button>
  );
}
