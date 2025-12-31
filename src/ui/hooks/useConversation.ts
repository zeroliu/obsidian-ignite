import { useState } from 'react';
import type { Message } from '../components/chat';

/**
 * Hook for managing chat conversation state.
 */
export function useConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Add a user message to the conversation.
   */
  const addUserMessage = (content: string): Message => {
    const message: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, message]);
    return message;
  };

  /**
   * Add an assistant message to the conversation.
   */
  const addAssistantMessage = (content: string, sources?: string[]): Message => {
    const message: Message = {
      id: `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: 'assistant',
      content,
      sources,
    };
    setMessages((prev) => [...prev, message]);
    return message;
  };

  /**
   * Update the last assistant message (for streaming).
   */
  const updateLastAssistantMessage = (content: string, sources?: string[]) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content,
            sources,
          },
        ];
      }
      return prev;
    });
  };

  /**
   * Clear all messages.
   */
  const clearMessages = () => {
    setMessages([]);
  };

  /**
   * Set messages (for loading existing conversation).
   */
  const setMessagesFromHistory = (history: Message[]) => {
    setMessages(history);
  };

  return {
    messages,
    isLoading,
    setIsLoading,
    addUserMessage,
    addAssistantMessage,
    updateLastAssistantMessage,
    clearMessages,
    setMessagesFromHistory,
  };
}
