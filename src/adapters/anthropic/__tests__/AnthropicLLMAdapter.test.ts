import type { LLMStreamCallbacks } from '@/ports';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicLLMAdapter } from '../AnthropicLLMAdapter';

// Mock fetch globally
global.fetch = vi.fn();

describe('AnthropicLLMAdapter', () => {
  let adapter: AnthropicLLMAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AnthropicLLMAdapter({
      apiKey: 'test-api-key',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
    });
  });

  describe('constructor', () => {
    it('should create adapter with valid config', () => {
      expect(adapter.getProviderName()).toBe('Anthropic');
      expect(adapter.getModelName()).toBe('claude-3-5-sonnet-20241022');
      expect(adapter.getMaxTokens()).toBe(200000);
    });

    it('should throw error if API key is empty', () => {
      expect(() => new AnthropicLLMAdapter({ apiKey: '' })).toThrow(
        'Anthropic API key is required',
      );
    });

    it('should throw error if API key is whitespace', () => {
      expect(() => new AnthropicLLMAdapter({ apiKey: '   ' })).toThrow(
        'Anthropic API key is required',
      );
    });

    it('should use default model if not provided', () => {
      const defaultAdapter = new AnthropicLLMAdapter({ apiKey: 'test-key' });
      expect(defaultAdapter.getModelName()).toBe('claude-3-5-sonnet-20241022');
    });
  });

  describe('chat', () => {
    it('should make successful API call', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello! How can I help?' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.chat([
        { role: 'user', content: 'Hello' },
      ]);

      expect(result.content).toBe('Hello! How can I help?');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          }),
        }),
      );
    });

    it('should separate system messages', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await adapter.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ]);

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.system).toBe('You are helpful');
      expect(requestBody.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should combine multiple system messages', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await adapter.chat([
        { role: 'system', content: 'First instruction' },
        { role: 'system', content: 'Second instruction' },
        { role: 'user', content: 'Hello' },
      ]);

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.system).toBe('First instruction\n\nSecond instruction');
    });

    it('should throw error on API failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      });

      await expect(
        adapter.chat([{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('Anthropic API error (401): Invalid API key');
    });

    it('should pass options to API', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await adapter.chat(
        [{ role: 'user', content: 'Hello' }],
        {
          temperature: 0.7,
          maxTokens: 2048,
          stopSequences: ['STOP'],
        },
      );

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.max_tokens).toBe(2048);
      expect(requestBody.stop_sequences).toEqual(['STOP']);
    });
  });

  describe('streamChat', () => {
    it('should handle streaming response', async () => {
      const streamData = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
        'data: {"type":"message_delta","usage":{"output_tokens":5}}',
      ].join('\n');

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(streamData),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const callbacks: LLMStreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await adapter.streamChat([{ role: 'user', content: 'Hello' }], callbacks);

      expect(callbacks.onToken).toHaveBeenCalledWith('Hello');
      expect(callbacks.onToken).toHaveBeenCalledWith(' world');
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: 'Hello world',
        usage: { inputTokens: 10, outputTokens: 5 },
      });
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON with error tracking', async () => {
      const streamData = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}',
        'data: invalid json 1',
        'data: invalid json 2',
        'data: invalid json 3',
        'data: invalid json 4',
        'data: invalid json 5',
        'data: invalid json 6',
      ].join('\n');

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(streamData),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const callbacks: LLMStreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await adapter.streamChat([{ role: 'user', content: 'Hello' }], callbacks);

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Too many parse errors'),
        }),
      );
    });

    it('should call onError on fetch failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const callbacks: LLMStreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await adapter.streamChat([{ role: 'user', content: 'Hello' }], callbacks);

      expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should respect abort signal', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const abortController = new AbortController();
      const callbacks: LLMStreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
        signal: abortController.signal,
      };

      await adapter.streamChat([{ role: 'user', content: 'Hello' }], callbacks);

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].signal).toBe(abortController.signal);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens with safety margin', () => {
      const text = 'a'.repeat(100);
      const estimate = adapter.estimateTokens(text);

      // Base: 100 / 4 = 25, with 20% margin = 30
      expect(estimate).toBe(30);
    });

    it('should handle empty string', () => {
      expect(adapter.estimateTokens('')).toBe(0);
    });

    it('should round up estimates', () => {
      const text = 'abc';
      const estimate = adapter.estimateTokens(text);

      // Base: 3 / 4 = 0.75 -> ceil to 1, with 20% margin = 1.2 -> ceil to 2
      expect(estimate).toBe(2);
    });
  });
});
