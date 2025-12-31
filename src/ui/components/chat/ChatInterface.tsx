import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../shared/Button';
import { ChatMessage } from './ChatMessage';

/**
 * Message structure for chat interface.
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

/**
 * Chat interface props.
 */
export interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Reusable chat UI with message list and input.
 */
export function ChatInterface({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = 'Type your message...',
  disabled = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="ignite-chat-interface">
      <div className="ignite-chat-messages">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
            sources={message.sources}
          />
        ))}
        {isLoading && (
          <div className="ignite-chat-loading">
            <div className="ignite-chat-loading-indicator">...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="ignite-chat-input-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="ignite-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={3}
        />
        <Button type="submit" variant="primary" disabled={disabled || isLoading || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
