/**
 * Chat message props.
 */
export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

/**
 * Individual message display with role-based styling.
 */
export function ChatMessage({ role, content, sources }: ChatMessageProps) {
  const roleClass = `ignite-chat-message-${role}`;

  return (
    <div className={`ignite-chat-message ${roleClass}`.trim()}>
      <div className="ignite-chat-message-role">{role === 'user' ? 'You' : 'Assistant'}</div>
      <div className="ignite-chat-message-content">{content}</div>
      {sources && sources.length > 0 && (
        <div className="ignite-chat-message-sources">
          <span className="ignite-chat-message-sources-label">Sources:</span>
          {sources.map((source) => (
            <span key={source} className="ignite-chat-message-source">
              {source}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
