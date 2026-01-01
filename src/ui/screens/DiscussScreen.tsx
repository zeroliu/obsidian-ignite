import { ConversationService } from '@/domain/goal/ConversationService';
import type { ChatMessage, Conversation, Goal } from '@/domain/goal/types';
import { useRouter } from '@/ui/Router';
import { ChatInterface } from '@/ui/components/chat';
import { Button } from '@/ui/components/shared/Button';
import { LoadingSpinner } from '@/ui/components/shared/LoadingSpinner';
import { useApp } from '@/ui/contexts/AppContext';
import { useGoals } from '@/ui/contexts/GoalContext';
import { useLLM } from '@/ui/contexts/LLMContext';
import { useConversation } from '@/ui/hooks/useConversation';
import { useCallback, useEffect, useState } from 'react';

/**
 * DiscussScreen component props.
 */
export interface DiscussScreenProps {
  goalId: string;
  conversationId?: string;
}

/**
 * Screen for discussing learning materials with AI.
 * Supports creating new conversations and resuming existing ones.
 */
export function DiscussScreen({ goalId, conversationId }: DiscussScreenProps) {
  const { vaultProvider } = useApp();
  const { llmProvider } = useLLM();
  const { goals } = useGoals();
  const { goBack } = useRouter();

  const {
    messages,
    isLoading,
    setIsLoading,
    addUserMessage,
    addAssistantMessage,
    updateLastAssistantMessage,
    setMessagesFromHistory,
  } = useConversation();

  const [conversationService] = useState(() => new ConversationService(vaultProvider, llmProvider));
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteContents, setNoteContents] = useState<Array<{ path: string; content: string }>>([]);

  const goal = goals.find((g: Goal) => g.id === goalId);

  // Load or create conversation on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsInitializing(true);
        setError(null);

        if (!goal) {
          setError('Goal not found');
          setIsInitializing(false);
          return;
        }

        // Load note contents
        const contents: Array<{ path: string; content: string }> = [];
        for (const notePath of goal.notesPaths) {
          try {
            const exists = await vaultProvider.exists(notePath);
            if (exists) {
              const content = await vaultProvider.readFile(notePath);
              contents.push({ path: notePath, content });
            }
          } catch (err) {
            console.warn(`Failed to load note: ${notePath}`, err);
          }
        }
        setNoteContents(contents);

        // Load existing conversation or create new one
        let conversation: Conversation | null = null;

        if (conversationId) {
          conversation = await conversationService.getConversationById(goalId, conversationId);
        }

        if (!conversation) {
          conversation = await conversationService.createConversation(goalId);
        }

        setCurrentConversation(conversation);

        // Load existing messages into state
        if (conversation.messages.length > 0) {
          const uiMessages = conversation.messages.map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            sources: msg.sources,
          }));
          setMessagesFromHistory(uiMessages);
        }
      } catch (err) {
        console.error('Failed to initialize discuss screen:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize');
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, [goalId, conversationId, goal, conversationService, vaultProvider, setMessagesFromHistory]);

  const handleSendMessage = useCallback(
    async (userMessage: string) => {
      if (!currentConversation || !goal) return;

      // Add user message to UI
      addUserMessage(userMessage);

      // Save user message to file
      const userChatMessage: Omit<ChatMessage, 'id' | 'timestamp'> = {
        role: 'user',
        content: userMessage,
      };

      try {
        await conversationService.addMessage(goalId, currentConversation.id, userChatMessage);
      } catch (err) {
        console.error('Failed to save user message:', err);
      }

      // Start streaming response
      setIsLoading(true);
      let accumulatedResponse = '';

      // Add empty assistant message to update during streaming
      addAssistantMessage('');

      try {
        // Build conversation history for LLM
        const history: ChatMessage[] = [
          ...currentConversation.messages,
          {
            id: 'temp',
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString(),
          },
        ];

        await conversationService.streamDiscussionResponse(goal, history, noteContents, {
          onToken: (token: string) => {
            accumulatedResponse += token;
            updateLastAssistantMessage(accumulatedResponse);
          },
          onComplete: async () => {
            setIsLoading(false);

            // Extract sources from response
            const sources = conversationService.extractSources(
              accumulatedResponse,
              goal.notesPaths,
            );

            // Update the last assistant message with sources
            updateLastAssistantMessage(accumulatedResponse, sources);

            // Save assistant message to file
            const assistantChatMessage: Omit<ChatMessage, 'id' | 'timestamp'> = {
              role: 'assistant',
              content: accumulatedResponse,
              sources: sources.length > 0 ? sources : undefined,
            };

            try {
              const updatedConversation = await conversationService.addMessage(
                goalId,
                currentConversation.id,
                assistantChatMessage,
              );

              // Update topic if this is the first exchange
              if (updatedConversation.messages.length === 2) {
                const topic = await conversationService.generateTopic(updatedConversation);
                await conversationService.updateTopic(goalId, currentConversation.id, topic);
              }

              setCurrentConversation(updatedConversation);
            } catch (err) {
              console.error('Failed to save assistant message:', err);
            }
          },
          onError: (error: Error) => {
            setIsLoading(false);
            console.error('Discussion error:', error);
            updateLastAssistantMessage(
              `Sorry, I encountered an error: ${error.message}. Please try again.`,
            );
          },
        });
      } catch (err) {
        setIsLoading(false);
        console.error('Discussion error:', err);
        updateLastAssistantMessage(
          `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        );
      }
    },
    [
      currentConversation,
      goal,
      goalId,
      noteContents,
      conversationService,
      addUserMessage,
      addAssistantMessage,
      updateLastAssistantMessage,
      setIsLoading,
    ],
  );

  if (isInitializing) {
    return (
      <div className="ignite-screen ignite-discuss-screen">
        <div className="ignite-screen-header">
          <h1 className="ignite-screen-title">Discussion</h1>
          <Button variant="secondary" onClick={goBack}>
            Back
          </Button>
        </div>
        <div className="ignite-screen-content">
          <div className="ignite-loading-container">
            <LoadingSpinner size="lg" />
            <p className="ignite-loading-text">Loading conversation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className="ignite-screen ignite-discuss-screen">
        <div className="ignite-screen-header">
          <h1 className="ignite-screen-title">Discussion</h1>
          <Button variant="secondary" onClick={goBack}>
            Back
          </Button>
        </div>
        <div className="ignite-screen-content">
          <div className="ignite-empty-state">
            <h3 className="ignite-empty-state-title">Error</h3>
            <p className="ignite-empty-state-description">{error ?? 'Goal not found'}</p>
            <Button variant="primary" onClick={goBack}>
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ignite-screen ignite-discuss-screen">
      <div className="ignite-screen-header">
        <div className="ignite-discuss-header-content">
          <h1 className="ignite-screen-title">{currentConversation?.topic ?? 'Discussion'}</h1>
          <span className="ignite-discuss-goal-name">{goal.name}</span>
        </div>
        <Button variant="secondary" onClick={goBack}>
          Back
        </Button>
      </div>

      <div className="ignite-discuss-content">
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Ask about your learning materials..."
        />
      </div>

      {noteContents.length > 0 && (
        <div className="ignite-discuss-notes-indicator">
          Using {noteContents.length} note{noteContents.length !== 1 ? 's' : ''} as context
        </div>
      )}
    </div>
  );
}
