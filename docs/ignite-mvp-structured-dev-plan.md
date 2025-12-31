---
title: "Ignite MVP"
total_phases: 5
created: 2024-12-31
---

# Ignite MVP Development Plan

> Structured development plan converted from `docs/ignite-mvp-dev-plan.md`

## Phase 1: Foundation (COMPLETE)

### Description
Establishes core data models, services, contexts, and infrastructure needed for all subsequent phases.

### Tasks
- [x] Create data models with discriminated unions (`src/domain/goal/types.ts`)
- [x] Extend ILLMProvider port with chat, streaming, and token management
- [x] Implement AnthropicLLMAdapter with streaming support
- [x] Implement GoalService with CRUD operations and markdown+frontmatter storage
- [x] Create frontmatter parsing/serialization utilities
- [x] Add `filterByIncludePatterns()` to `src/domain/pipeline/pathFilter.ts`
- [x] Create React contexts (AppContext, GoalContext, LLMContext)
- [x] Create Router component with history navigation
- [x] Update settings with `includePaths` and `excludePaths` fields

### Files Created/Modified
- `src/domain/goal/types.ts` - Goal, Milestone, Conversation, QASession types
- `src/domain/goal/GoalService.ts` - Goal CRUD with markdown storage
- `src/domain/goal/frontmatterUtils.ts` - Frontmatter parsing/serialization
- `src/ports/ILLMProvider.ts` - Extended LLM interface
- `src/adapters/anthropic/AnthropicLLMAdapter.ts` - Claude API implementation
- `src/domain/pipeline/pathFilter.ts` - Added include pattern filtering
- `src/ui/contexts/AppContext.tsx` - Adapter injection context
- `src/ui/contexts/GoalContext.tsx` - Goal state management
- `src/ui/contexts/LLMContext.tsx` - LLM provider context
- `src/ui/Router.tsx` - Screen navigation with history
- `src/settings.ts` - Added path filtering settings

### Success Criteria
- [x] All types compile with strict TypeScript
- [x] GoalService tests pass
- [x] Frontmatter utils tests pass
- [x] AnthropicLLMAdapter tests pass

---

## Phase 2: Core UI Components

### Description
Build shared UI components and foundational screens (Home, Goal Detail). These form the visual backbone of the application and must be completed before feature-specific screens.

### Tasks
- [ ] Create shared Button component with variants (primary, secondary, danger)
- [ ] Create shared Card component for content containers
- [ ] Create shared Input component with label and error states
- [ ] Create shared ProgressBar component for milestone progress
- [ ] Create shared LoadingSpinner component
- [ ] Create GoalCard component displaying goal summary with progress
- [ ] Create MilestoneList component with checkbox toggles
- [ ] Create ActionCard component for Discuss/Q&A actions
- [ ] Create HomeScreen with empty state and goals list
- [ ] Create GoalDetailScreen with milestones, notes list, and action buttons
- [ ] Wire up IgniteApp to render screens based on Router state
- [ ] Add basic CSS styling for all components

### Files to Create/Modify
- `src/ui/components/shared/Button.tsx` - Reusable button with variants
- `src/ui/components/shared/Card.tsx` - Content container
- `src/ui/components/shared/Input.tsx` - Text input with label
- `src/ui/components/shared/ProgressBar.tsx` - Visual progress indicator
- `src/ui/components/shared/LoadingSpinner.tsx` - Loading state
- `src/ui/components/shared/index.ts` - Export all shared components
- `src/ui/components/goal/GoalCard.tsx` - Goal summary card
- `src/ui/components/goal/MilestoneList.tsx` - Editable milestone list
- `src/ui/components/goal/ActionCard.tsx` - Action button cards
- `src/ui/components/goal/index.ts` - Export goal components
- `src/ui/screens/HomeScreen.tsx` - Home with goals list
- `src/ui/screens/GoalDetailScreen.tsx` - Goal detail view
- `src/ui/IgniteApp.tsx` - Add screen rendering logic
- `styles.css` - Component styles

### Success Criteria
- [ ] HomeScreen displays "No goals yet" when empty
- [ ] HomeScreen displays list of GoalCards when goals exist
- [ ] Clicking GoalCard navigates to GoalDetailScreen
- [ ] GoalDetailScreen shows milestones with toggle functionality
- [ ] GoalDetailScreen shows Discuss and Q&A action cards
- [ ] Back navigation works from GoalDetailScreen to Home
- [ ] All components are responsive and keyboard accessible

---

## Phase 3: Goal Creation Flow

### Description
Implement the brainstorm agent and note assignment screens. This enables users to create goals through AI-assisted conversation and assign relevant notes.

### Tasks
- [ ] Create ChatInterface component with message list and input
- [ ] Create ChatMessage component with role-based styling
- [ ] Create SourcesCard component for displaying note references
- [ ] Create useConversation hook for chat state management
- [ ] Create BrainstormService for goal creation conversation logic
- [ ] Create brainstorm system prompt
- [ ] Create GoalPreview component showing generated goal details
- [ ] Create BrainstormScreen with chat interface and goal preview
- [ ] Create NoteRelevanceService for AI-based note scoring
- [ ] Create noteRelevance system prompt
- [ ] Create NoteCard component with relevance score
- [ ] Create NoteList component with multi-select
- [ ] Create NoteAssignmentScreen with ranked notes
- [ ] Add "note-assignment" screen type to Router
- [ ] Wire brainstorm flow: Brainstorm → NoteAssignment → GoalDetail

### Files to Create/Modify
- `src/ui/components/chat/ChatInterface.tsx` - Reusable chat UI
- `src/ui/components/chat/ChatMessage.tsx` - Individual message display
- `src/ui/components/chat/SourcesCard.tsx` - Note source references
- `src/ui/components/chat/index.ts` - Export chat components
- `src/ui/hooks/useConversation.ts` - Chat state management hook
- `src/domain/goal/BrainstormService.ts` - Goal brainstorming logic
- `src/adapters/anthropic/prompts/brainstorm.ts` - Brainstorm system prompt
- `src/ui/components/goal/GoalPreview.tsx` - Preview before creation
- `src/ui/screens/BrainstormScreen.tsx` - Brainstorm conversation
- `src/domain/goal/NoteRelevanceService.ts` - AI note scoring
- `src/adapters/anthropic/prompts/noteRelevance.ts` - Relevance prompt
- `src/ui/components/notes/NoteCard.tsx` - Note with score
- `src/ui/components/notes/NoteList.tsx` - Selectable note list
- `src/ui/components/notes/index.ts` - Export notes components
- `src/ui/screens/NoteAssignmentScreen.tsx` - Note selection UI
- `src/ui/Router.tsx` - Add note-assignment screen type

### Success Criteria
- [ ] User can start brainstorm from HomeScreen
- [ ] Chat streams responses token-by-token
- [ ] AI generates goal name, description, milestones, and deadline
- [ ] GoalPreview shows generated goal for confirmation
- [ ] After confirmation, NoteAssignmentScreen shows ranked notes
- [ ] Notes filtered by includePaths/excludePaths settings
- [ ] User can select/deselect notes before final creation
- [ ] Creating goal navigates to GoalDetailScreen

---

## Phase 4: Discuss and Q&A Actions

### Description
Implement the Discuss and Q&A features that allow users to explore their notes through conversation and test their knowledge through quizzes.

### Tasks
- [ ] Create ConversationService for discussion message handling
- [ ] Create discuss system prompt with source attribution
- [ ] Create DiscussScreen with chat interface
- [ ] Implement auto-save for conversations to markdown
- [ ] Create useQASession hook for quiz state management
- [ ] Create QAService for question generation and answer evaluation
- [ ] Create qaGeneration system prompt
- [ ] Create QuestionCard component for displaying questions
- [ ] Create AnswerOption component for multiple choice
- [ ] Create OpenEndedInput component for free-form answers
- [ ] Create SessionSummary component showing score and feedback
- [ ] Create QAScreen with question flow
- [ ] Implement Q&A session persistence to markdown
- [ ] Create conversation/session list views in GoalDetailScreen

### Files to Create/Modify
- `src/domain/goal/ConversationService.ts` - Conversation CRUD and messaging
- `src/adapters/anthropic/prompts/discuss.ts` - Discuss system prompt
- `src/ui/screens/DiscussScreen.tsx` - Discussion chat UI
- `src/ui/hooks/useQASession.ts` - Q&A quiz state
- `src/domain/goal/QAService.ts` - Question generation and scoring
- `src/adapters/anthropic/prompts/qaGeneration.ts` - Q&A prompt
- `src/ui/components/qa/QuestionCard.tsx` - Question display
- `src/ui/components/qa/AnswerOption.tsx` - MC answer option
- `src/ui/components/qa/OpenEndedInput.tsx` - Open-ended answer
- `src/ui/components/qa/SessionSummary.tsx` - Score and feedback
- `src/ui/components/qa/index.ts` - Export Q&A components
- `src/ui/screens/QAScreen.tsx` - Quiz flow UI
- `src/ui/components/goal/ConversationList.tsx` - List past conversations
- `src/ui/components/goal/QASessionList.tsx` - List past Q&A sessions
- `src/ui/screens/GoalDetailScreen.tsx` - Add conversation/session lists

### Success Criteria
- [ ] User can start new discussion from GoalDetailScreen
- [ ] Discussion uses goal's assigned notes as context
- [ ] AI responses include source attribution
- [ ] Conversation auto-saves on each message
- [ ] User can resume previous conversations
- [ ] User can start Q&A session from GoalDetailScreen
- [ ] Q&A generates mix of multiple-choice and open-ended questions
- [ ] Questions reference content from assigned notes
- [ ] Session shows score upon completion
- [ ] Q&A sessions persist and can be viewed in history

---

## Phase 5: Polish and Completion

### Description
Final polish including goal completion flow, comprehensive error handling, edge cases, and testing to ensure production readiness.

### Tasks
- [ ] Implement goal completion flow with confirmation dialog
- [ ] Add completion celebration/feedback UI
- [ ] Implement comprehensive error boundaries
- [ ] Add error states for API failures (network, rate limits)
- [ ] Add loading states for all async operations
- [ ] Implement conversation recovery for corrupted files
- [ ] Add input validation for goal names (path traversal prevention)
- [ ] Add API key validation in settings
- [ ] Implement rate limiting for LLM requests
- [ ] Add empty state handling for all lists
- [ ] Write integration tests for goal creation flow
- [ ] Write integration tests for conversation auto-save
- [ ] Write integration tests for Q&A session flow
- [ ] Manual E2E testing (see checklist below)
- [ ] Performance testing with large vaults (1000+ notes)
- [ ] Fix any identified bugs

### Files to Create/Modify
- `src/ui/components/goal/CompletionDialog.tsx` - Completion confirmation
- `src/ui/components/shared/ErrorMessage.tsx` - Error display
- `src/ui/components/shared/EmptyState.tsx` - Empty list states
- `src/domain/goal/ConversationService.ts` - Add recovery logic
- `src/settings.ts` - Add API key validation
- `src/adapters/anthropic/AnthropicLLMAdapter.ts` - Add rate limiting
- `src/domain/goal/__tests__/integration/goalCreation.test.ts`
- `src/domain/goal/__tests__/integration/conversation.test.ts`
- `src/domain/goal/__tests__/integration/qaSession.test.ts`

### Success Criteria
- [ ] Goal can be marked complete with confirmation
- [ ] All API errors show user-friendly messages
- [ ] Loading spinners appear during all async operations
- [ ] Corrupted conversation files can be recovered/reset
- [ ] Invalid goal names are rejected with clear error
- [ ] Rate limiting prevents excessive API usage
- [ ] All integration tests pass
- [ ] Manual E2E checklist completed

### E2E Testing Checklist
- [ ] Create goal with brainstorm agent
- [ ] Assign notes to goal with AI relevance scoring
- [ ] Start discussion, send 10+ messages, verify auto-save
- [ ] Resume previous discussion
- [ ] Start Q&A session, answer 5 questions, verify scoring
- [ ] View Q&A history
- [ ] Mark goal as complete
- [ ] Test with large vault (1000+ notes)
- [ ] Test with empty vault
- [ ] Test path filtering with complex glob patterns

---

## Dependency Graph

```
Phase 1 (Foundation) ─────┬─────> Phase 2 (Core UI)
                          │              │
                          │              ▼
                          └─────> Phase 3 (Goal Creation)
                                         │
                                         ▼
                                  Phase 4 (Actions)
                                         │
                                         ▼
                                  Phase 5 (Polish)
```

## Notes

- **Phase 1 is complete** - All foundation work has been implemented
- Each remaining phase builds on previous phases
- Phase 2 must complete before Phase 3 (shared components needed)
- Phase 3 can partially overlap with Phase 4 (services are independent)
- Phase 5 should begin only after core features work end-to-end
