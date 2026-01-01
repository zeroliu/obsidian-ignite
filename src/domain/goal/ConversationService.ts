import { DISCUSS_SYSTEM_PROMPT, buildNotesContext } from '@/adapters/anthropic/prompts/discuss';
import type { ILLMProvider, IVaultProvider, LLMMessage, LLMStreamCallbacks } from '@/ports';
import { parseFrontmatter, serializeFrontmatter } from './frontmatterUtils';
import type { ChatMessage, Conversation, Goal } from './types';

/**
 * Frontmatter structure for conversation markdown files.
 */
interface ConversationFrontmatter {
  id: string;
  goalId: string;
  topic: string;
  createdAt: string;
}

/**
 * Service for managing discussion conversations for goals.
 * Handles conversation CRUD, messaging, and persistence to markdown files.
 */
export class ConversationService {
  private static readonly CONVERSATIONS_FOLDER = 'conversations';

  constructor(
    private vaultProvider: IVaultProvider,
    private llmProvider: ILLMProvider,
  ) {}

  /**
   * Get all conversations for a goal.
   */
  async getConversationsForGoal(goalId: string): Promise<Conversation[]> {
    const folderPath = this.getConversationsFolderPath(goalId);
    const exists = await this.vaultProvider.exists(folderPath);

    if (!exists) {
      return [];
    }

    const files = await this.vaultProvider.listMarkdownFiles();
    const conversationFiles = files.filter(
      (file) => file.path.startsWith(`${folderPath}/`) && file.path.endsWith('.md'),
    );

    const conversationPromises = conversationFiles.map(async (file) => {
      try {
        return await this.loadConversation(file.path);
      } catch (error) {
        console.warn(`Failed to load conversation from ${file.path}:`, error);
        return null;
      }
    });

    const results = await Promise.all(conversationPromises);
    return results
      .filter((conv): conv is Conversation => conv !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Get a conversation by ID.
   */
  async getConversationById(goalId: string, conversationId: string): Promise<Conversation | null> {
    const path = this.getConversationPath(goalId, conversationId);
    const exists = await this.vaultProvider.exists(path);

    if (!exists) {
      return null;
    }

    return this.loadConversation(path);
  }

  /**
   * Create a new conversation.
   */
  async createConversation(goalId: string, topic?: string): Promise<Conversation> {
    const conversationId = this.generateConversationId();
    const now = new Date().toISOString();

    const conversation: Conversation = {
      id: conversationId,
      goalId,
      topic: topic ?? 'New Discussion',
      messages: [],
      createdAt: now,
    };

    await this.saveConversation(conversation);
    return conversation;
  }

  /**
   * Add a message to a conversation and save it.
   */
  async addMessage(
    goalId: string,
    conversationId: string,
    message: Omit<ChatMessage, 'id' | 'timestamp'>,
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(goalId, conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const newMessage: ChatMessage = {
      id: this.generateMessageId(),
      role: message.role,
      content: message.content,
      sources: message.sources,
      timestamp: new Date().toISOString(),
    };

    conversation.messages.push(newMessage);
    await this.saveConversation(conversation);
    return conversation;
  }

  /**
   * Update the last message in a conversation (for streaming).
   */
  async updateLastMessage(
    goalId: string,
    conversationId: string,
    content: string,
    sources?: string[],
  ): Promise<Conversation> {
    const conversation = await this.getConversationById(goalId, conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    if (conversation.messages.length === 0) {
      throw new Error('No messages to update');
    }

    const lastMessage = conversation.messages[conversation.messages.length - 1];
    lastMessage.content = content;
    if (sources) {
      lastMessage.sources = sources;
    }

    await this.saveConversation(conversation);
    return conversation;
  }

  /**
   * Update the conversation topic.
   */
  async updateTopic(goalId: string, conversationId: string, topic: string): Promise<Conversation> {
    const conversation = await this.getConversationById(goalId, conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.topic = topic;
    await this.saveConversation(conversation);
    return conversation;
  }

  /**
   * Delete a conversation.
   */
  async deleteConversation(goalId: string, conversationId: string): Promise<void> {
    const path = this.getConversationPath(goalId, conversationId);
    const exists = await this.vaultProvider.exists(path);

    if (!exists) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    await this.vaultProvider.deleteFile(path);
  }

  /**
   * Stream a discussion response from the LLM.
   */
  async streamDiscussionResponse(
    goal: Goal,
    conversationHistory: ChatMessage[],
    noteContents: Array<{ path: string; content: string }>,
    callbacks: LLMStreamCallbacks,
  ): Promise<void> {
    const notesContext = buildNotesContext(noteContents);

    const messages: LLMMessage[] = [
      { role: 'system', content: DISCUSS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `I'm working on a learning goal: "${goal.name}"\n\nGoal description: ${goal.description}\n\n${notesContext}`,
      },
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    await this.llmProvider.streamChat(messages, callbacks, {
      temperature: 0.7,
      maxTokens: 2000,
    });
  }

  /**
   * Generate a topic for the conversation based on its content.
   */
  async generateTopic(conversation: Conversation): Promise<string> {
    if (conversation.messages.length === 0) {
      return 'New Discussion';
    }

    // Use the first user message as a basis for the topic
    const firstUserMessage = conversation.messages.find((m) => m.role === 'user');
    if (!firstUserMessage) {
      return 'New Discussion';
    }

    // Simple topic extraction: take the first 50 characters of the first user message
    const content = firstUserMessage.content.trim();
    if (content.length <= 50) {
      return content;
    }

    // Find a good break point
    const breakPoint = content.lastIndexOf(' ', 50);
    if (breakPoint > 20) {
      return `${content.substring(0, breakPoint)}...`;
    }

    return `${content.substring(0, 50)}...`;
  }

  /**
   * Extract sources mentioned in the LLM response.
   */
  extractSources(response: string, availableNotes: string[]): string[] {
    const sources: Set<string> = new Set();

    for (const notePath of availableNotes) {
      // Check if the note path or name is mentioned in the response
      const noteName = notePath.split('/').pop()?.replace('.md', '') ?? notePath;
      if (response.includes(notePath) || response.toLowerCase().includes(noteName.toLowerCase())) {
        sources.add(notePath);
      }
    }

    return Array.from(sources);
  }

  /**
   * Load a conversation from a file path.
   */
  private async loadConversation(path: string): Promise<Conversation> {
    const content = await this.vaultProvider.readFile(path);
    const { frontmatter, body } = parseFrontmatter<ConversationFrontmatter>(content);

    // Parse messages from body
    const messages = this.parseMessagesFromBody(body);

    return {
      id: frontmatter.id,
      goalId: frontmatter.goalId,
      topic: frontmatter.topic,
      messages,
      createdAt: frontmatter.createdAt,
    };
  }

  /**
   * Save a conversation to the vault.
   */
  private async saveConversation(conversation: Conversation): Promise<void> {
    const folderPath = this.getConversationsFolderPath(conversation.goalId);
    const conversationPath = this.getConversationPath(conversation.goalId, conversation.id);

    // Ensure folder exists
    await this.vaultProvider.createFolder(folderPath);

    const frontmatter: ConversationFrontmatter = {
      id: conversation.id,
      goalId: conversation.goalId,
      topic: conversation.topic,
      createdAt: conversation.createdAt,
    };

    const body = this.serializeMessagesToBody(conversation.messages);
    const content = serializeFrontmatter(frontmatter, body);

    const exists = await this.vaultProvider.exists(conversationPath);
    if (exists) {
      await this.vaultProvider.modifyFile(conversationPath, content);
    } else {
      await this.vaultProvider.createFile(conversationPath, content);
    }
  }

  /**
   * Parse messages from the markdown body.
   */
  private parseMessagesFromBody(body: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const messageBlocks = body.split(/\n---\n/).filter((block) => block.trim());

    for (const block of messageBlocks) {
      const lines = block.trim().split('\n');
      if (lines.length === 0) continue;

      // Parse header line: ## [Role] - [Timestamp]
      const headerMatch = lines[0].match(/^## (User|Assistant) - (.+)$/);
      if (!headerMatch) continue;

      const role = headerMatch[1].toLowerCase() as 'user' | 'assistant';
      const timestamp = headerMatch[2];

      // Find sources if present
      let sources: string[] | undefined;
      const contentLines: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('Sources: ')) {
          const sourcesStr = line.replace('Sources: ', '');
          sources = sourcesStr.split(', ').filter((s) => s.trim());
        } else {
          contentLines.push(line);
        }
      }

      const content = contentLines.join('\n').trim();
      if (!content) continue;

      messages.push({
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        role,
        content,
        sources,
        timestamp,
      });
    }

    return messages;
  }

  /**
   * Serialize messages to markdown body.
   */
  private serializeMessagesToBody(messages: ChatMessage[]): string {
    if (messages.length === 0) {
      return '# Conversation\n\nNo messages yet.';
    }

    const blocks: string[] = ['# Conversation\n'];

    for (const message of messages) {
      const roleLabel = message.role === 'user' ? 'User' : 'Assistant';
      let block = `## ${roleLabel} - ${message.timestamp}\n\n${message.content}`;

      if (message.sources && message.sources.length > 0) {
        block += `\n\nSources: ${message.sources.join(', ')}`;
      }

      blocks.push(block);
    }

    return blocks.join('\n\n---\n\n');
  }

  /**
   * Get the folder path for a goal's conversations.
   */
  private getConversationsFolderPath(goalId: string): string {
    return `ignite/${goalId}/${ConversationService.CONVERSATIONS_FOLDER}`;
  }

  /**
   * Get the file path for a conversation.
   */
  private getConversationPath(goalId: string, conversationId: string): string {
    return `${this.getConversationsFolderPath(goalId)}/${conversationId}.md`;
  }

  /**
   * Generate a unique conversation ID.
   */
  private generateConversationId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `conv-${crypto.randomUUID()}`;
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `conv-${timestamp}-${random}`;
  }

  /**
   * Generate a unique message ID.
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
