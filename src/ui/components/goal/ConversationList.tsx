import type { Conversation } from '@/domain/goal/types';
import { Card } from '@/ui/components/shared/Card';

/**
 * ConversationList component props.
 */
export interface ConversationListProps {
  conversations: Conversation[];
  onSelect: (conversationId: string) => void;
}

/**
 * Component for displaying a list of past conversations.
 */
export function ConversationList({ conversations, onSelect }: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <p className="ignite-conversation-list-empty">
        No discussions yet. Start a new discussion to explore your learning materials.
      </p>
    );
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="ignite-conversation-list">
      {conversations.map((conversation) => (
        <Card
          key={conversation.id}
          className="ignite-conversation-item"
          interactive
          onClick={() => onSelect(conversation.id)}
        >
          <div className="ignite-conversation-item-content">
            <h4 className="ignite-conversation-item-topic">{conversation.topic}</h4>
            <div className="ignite-conversation-item-meta">
              <span className="ignite-conversation-item-date">
                {formatDate(conversation.createdAt)}
              </span>
              <span className="ignite-conversation-item-messages">
                {conversation.messages.length} message
                {conversation.messages.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
