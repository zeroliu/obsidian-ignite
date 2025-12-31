# Ignite MVP Development Plan

> Created: 2024-12-30

## MVP Scope

### Features to Build

| Feature | Scope |
|---------|-------|
| **Goal Creation** | Brainstorm agent, AI-suggested milestones, folder structure |
| **Note Assignment** | AI scan + relevance scoring, user confirms |
| **Goal Detail** | Milestones (editable), deadline, Notes list, Conversations list |
| **Discuss** | Explore mode only, auto-save, resume previous, source attribution |
| **Q&A** | Multiple choice + open-ended, session saves, view history |
| **Home** | Active goals list, create CTA |
| **Completion** | Simple "Mark Complete" |
| **Settings** | Extend existing tab: `includePaths`, `excludePaths` (glob patterns) |

### Cut from MVP

- Research Action
- Draft Action
- Discuss modes (Teach Me, Challenge)
- Archived goals view
- Onboarding/Welcome screen

---

## Architecture

### Data Flow

```
React UI (Contexts + Hooks)
    ↓
Domain Services (GoalService, ConversationService, QAService)
    ↓
Ports (IVaultProvider, IStorageAdapter, ILLMProvider)
    ↓
Adapters (Obsidian, Anthropic)
```

### State Management

- **AppContext**: Injects adapters from IgniteView
- **GoalContext**: Goal state + operations
- **LLMContext**: LLM provider + streaming

### Navigation

Simple state-based router (no React Router):

```typescript
type Screen =
  | { type: 'home' }
  | { type: 'brainstorm' }
  | { type: 'goal-detail'; goalId: string }
  | { type: 'discuss'; goalId: string; conversationId?: string }
  | { type: 'qa'; goalId: string };
```

---

## File Structure

### New Files to Create

```
src/
├── domain/goal/
│   ├── types.ts                 # Goal, Milestone, Conversation, QASession types
│   ├── GoalService.ts           # Goal CRUD operations
│   ├── ConversationService.ts   # Chat message handling
│   ├── QAService.ts             # Question generation, scoring
│   ├── BrainstormService.ts     # Goal creation chat logic
│   ├── NoteRelevanceService.ts  # AI-based note scoring
│   └── __tests__/
├── ports/
│   └── ILLMProvider.ts          # LLM abstraction
├── adapters/anthropic/
│   ├── AnthropicLLMAdapter.ts   # Claude API implementation
│   └── prompts/                 # System prompts
│       ├── brainstorm.ts
│       ├── discuss.ts
│       ├── noteRelevance.ts
│       └── qaGeneration.ts
├── ui/
│   ├── Router.tsx               # Screen navigation
│   ├── contexts/
│   │   ├── AppContext.tsx
│   │   ├── GoalContext.tsx
│   │   └── LLMContext.tsx
│   ├── hooks/
│   │   ├── useGoals.ts
│   │   ├── useConversation.ts
│   │   └── useQASession.ts
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── BrainstormScreen.tsx
│   │   ├── NoteAssignmentScreen.tsx
│   │   ├── GoalDetailScreen.tsx
│   │   ├── DiscussScreen.tsx
│   │   └── QAScreen.tsx
│   └── components/
│       ├── shared/              # Button, Card, Input, ProgressBar
│       ├── goal/                # GoalCard, MilestoneList, ActionCard
│       ├── chat/                # ChatInterface, ChatMessage, SourcesCard
│       ├── notes/               # NoteCard, NoteList
│       └── qa/                  # QuestionCard, AnswerOption, SessionSummary
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/settings.ts` | Add `includePaths: string[]`, `excludePaths: string[]` |
| `src/adapters/obsidian/IgniteView.tsx` | Pass adapters + settings to IgniteApp |
| `src/ui/IgniteApp.tsx` | Add context providers and router |
| `src/main.ts` | Pass plugin reference to IgniteView |
| `styles.css` | Add component styles |

---

## Data Models

```typescript
// src/domain/goal/types.ts

interface Goal {
  id: string;
  name: string;
  description: string;
  deadline: string;           // ISO date
  milestones: Milestone[];
  notesPaths: string[];
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

interface Milestone {
  id: string;
  content: string;
  completed: boolean;
  order: number;
}

interface Conversation {
  id: string;
  goalId: string;
  topic: string;              // AI-generated
  messages: ChatMessage[];
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];         // Note paths used
  timestamp: string;
}

interface QASession {
  id: string;
  goalId: string;
  questions: Question[];
  answers: Answer[];
  score: number;
  createdAt: string;
  completedAt?: string;
}

interface Question {
  id: string;
  type: 'multiple-choice' | 'open-ended';
  text: string;
  sourceNotePath: string;
  options?: string[];
  correctAnswer?: number;
}

interface Answer {
  questionId: string;
  userAnswer: string | number;
  isCorrect: boolean;
  explanation: string;
}
```

---

## Storage Structure

```
.ignite/                      # Hidden storage (plugin data)
├── goals/
│   ├── index.json            # Goal list metadata
│   └── {goalId}.json         # Individual goal data
└── qa-sessions/
    └── {goalId}/
        └── {sessionId}.json

ignite/                       # In vault (user-visible)
└── {goal-name}/
    ├── goal.md               # Goal metadata in frontmatter
    └── conversations/
        └── {topic}.md        # Auto-saved discussions
```

---

## Settings

```typescript
interface IgniteSettings {
  anthropicApiKey: string;
  includePaths: string[];     // Glob patterns (e.g., "notes/**", "projects/*.md")
  excludePaths: string[];     // Glob patterns (e.g., "templates/**", "archive/**")
}
```

### Path Filtering Logic

- Both `includePaths` and `excludePaths` can be set together
- When both are set: First filter to files matching `includePaths`, then remove files matching `excludePaths`
- When only `includePaths` is set: Only include matching files
- When only `excludePaths` is set: Include all files except matching ones

```typescript
let filteredNotes = notes;

if (settings.includePaths.length > 0) {
  filteredNotes = filteredNotes.filter(n =>
    matchesAnyGlob(n.path, settings.includePaths)
  );
}

if (settings.excludePaths.length > 0) {
  filteredNotes = filteredNotes.filter(n =>
    !matchesAnyGlob(n.path, settings.excludePaths)
  );
}
```

---

## Build Order

### Phase 1: Foundation

1. Data models (`src/domain/goal/types.ts`)
2. ILLMProvider port + AnthropicLLMAdapter
3. GoalService (CRUD with storage)
4. React contexts (App, Goal, LLM)
5. Router component

### Phase 2: Core UI

1. Shared components (Button, Card, Input, ProgressBar)
2. HomeScreen (empty + populated states)
3. GoalDetailScreen (milestones, actions, notes)
4. Settings update (includePaths, excludePaths)

### Phase 3: Goal Creation

1. ChatInterface component (reusable)
2. BrainstormService + prompts
3. BrainstormScreen with GoalPreview
4. NoteRelevanceService
5. NoteAssignmentScreen

### Phase 4: Actions

1. Discuss action + ConversationService
2. Conversation auto-save to markdown
3. Resume conversation UI
4. Q&A action + QAService
5. Q&A session persistence + history

### Phase 5: Polish

1. Goal completion flow
2. Error handling
3. Testing

---

## Implementation Details

### Adapter Injection

```typescript
// IgniteView.tsx
this.root.render(
  <IgniteApp
    vaultProvider={new ObsidianVaultAdapter(this.app)}
    storageAdapter={new ObsidianStorageAdapter(this.app)}
    metadataProvider={new ObsidianMetadataAdapter(this.app)}
    settings={this.plugin.settings}
  />
);
```

### Goal Folder Creation

When creating a goal, GoalService must:

1. Create `ignite/{goal-name}/` folder in vault
2. Create `goal.md` with frontmatter metadata
3. Create `conversations/` subdirectory

### Conversation Auto-Save Format

```markdown
---
id: conv-456
goalId: abc-123
topic: React patterns
createdAt: 2024-12-30T11:00:00Z
---

**User** (11:00 AM)
What React patterns should I use?

**Assistant** (11:00 AM)
Based on your notes...

[Sources: [[React Best Practices]]]
```

---

## ILLMProvider Port

```typescript
interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface LLMStreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (response: LLMResponse) => void;
  onError: (error: Error) => void;
}

interface ILLMProvider {
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
  streamChat(messages: LLMMessage[], callbacks: LLMStreamCallbacks): Promise<void>;
  getProviderName(): string;
  getModelName(): string;
}
```
