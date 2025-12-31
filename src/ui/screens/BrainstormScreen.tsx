import { BrainstormService, type GoalDraft } from '@/domain/goal/BrainstormService';
import { useState } from 'react';
import { useRouter } from '../Router';
import { ChatInterface } from '../components/chat';
import { GoalPreview } from '../components/goal/GoalPreview';
import { Button } from '../components/shared/Button';
import { useLLM } from '../contexts/LLMContext';
import { useConversation } from '../hooks/useConversation';

/**
 * Brainstorm screen for goal creation through AI conversation.
 */
export function BrainstormScreen() {
  const router = useRouter();
  const { llmProvider } = useLLM();
  const {
    messages,
    isLoading,
    setIsLoading,
    addUserMessage,
    addAssistantMessage,
    updateLastAssistantMessage,
  } = useConversation();

  const [brainstormService] = useState(() => new BrainstormService(llmProvider));
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);

  const handleSendMessage = async (userMessage: string) => {
    // Add user message
    addUserMessage(userMessage);

    // Start streaming response
    setIsLoading(true);
    let accumulatedResponse = '';

    // Add empty assistant message to update during streaming
    addAssistantMessage('');

    try {
      // Build conversation history
      const history = [
        ...messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user' as const, content: userMessage },
      ];

      await brainstormService.streamResponse(history, {
        onToken: (token: string) => {
          accumulatedResponse += token;
          updateLastAssistantMessage(accumulatedResponse);
        },
        onComplete: () => {
          setIsLoading(false);

          // Try to extract goal draft
          const draft = brainstormService.extractGoalDraft(accumulatedResponse);
          if (draft) {
            setGoalDraft(draft);
          }
        },
        onError: (error: Error) => {
          setIsLoading(false);
          console.error('Brainstorm error:', error);
          updateLastAssistantMessage(
            `Sorry, I encountered an error: ${error.message}. Please try again.`,
          );
        },
      });
    } catch (error) {
      setIsLoading(false);
      console.error('Brainstorm error:', error);
      updateLastAssistantMessage(
        `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      );
    }
  };

  const handleConfirmGoal = () => {
    if (goalDraft) {
      // Navigate to note assignment screen with goal draft
      router.navigate({ type: 'note-assignment', goalDraft });
    }
  };

  const handleCancelPreview = () => {
    // Clear the draft and allow user to continue conversation
    setGoalDraft(null);
  };

  return (
    <div className="ignite-brainstorm-screen">
      <div className="ignite-screen-header">
        <h1 className="ignite-screen-title">Create a Learning Goal</h1>
        {router.canGoBack && (
          <Button variant="secondary" onClick={() => router.goBack()}>
            Back
          </Button>
        )}
      </div>

      <div className="ignite-brainstorm-content">
        <div className="ignite-brainstorm-chat">
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            placeholder="Tell me what you'd like to learn..."
            disabled={goalDraft !== null}
          />
        </div>

        {goalDraft && (
          <div className="ignite-brainstorm-preview">
            <GoalPreview
              draft={goalDraft}
              onConfirm={handleConfirmGoal}
              onCancel={handleCancelPreview}
            />
          </div>
        )}
      </div>
    </div>
  );
}
