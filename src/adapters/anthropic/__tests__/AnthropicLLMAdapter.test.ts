import type { ClusterSummary } from '@/domain/llm/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicLLMAdapter, LLMApiError } from '../AnthropicLLMAdapter';

// Mock the Anthropic SDK
const mockCreate = vi.fn();

// Mock Anthropic module with a class (required for Vitest 4.x)
vi.mock('@anthropic-ai/sdk', () => {
	return {
		default: class MockAnthropic {
			messages = {
				create: mockCreate,
			};
		},
	};
});

// Helper to create an API-like error with status
function createApiError(message: string, status: number): Error & { status: number } {
	const error = new Error(message) as Error & { status: number };
	error.status = status;
	return error;
}

describe('AnthropicLLMAdapter', () => {
	let adapter: AnthropicLLMAdapter;

	beforeEach(() => {
		mockCreate.mockReset();

		adapter = new AnthropicLLMAdapter('test-api-key', {
			maxRetries: 2,
			retryBaseDelay: 10, // Fast retries for testing
		});
	});

	describe('nameConceptsBatch', () => {
		it('should successfully name concepts', async () => {
			const mockResponse = {
				content: [
					{
						type: 'text',
						text: JSON.stringify([
							{
								clusterId: 'cluster-1',
								canonicalName: 'React Development',
								quizzabilityScore: 0.9,
								suggestedMerges: [],
								misfitNotes: [],
							},
						]),
					},
				],
				usage: {
					input_tokens: 100,
					output_tokens: 50,
				},
			};

			mockCreate.mockResolvedValueOnce(mockResponse);

			const clusters: ClusterSummary[] = [
				{
					clusterId: 'cluster-1',
					candidateNames: ['React'],
					representativeTitles: ['Hooks Guide'],
					commonTags: ['#react'],
					folderPath: 'tech/react',
					noteCount: 10,
				},
			];

			const result = await adapter.nameConceptsBatch({ clusters });

			expect(result.results).toHaveLength(1);
			expect(result.results[0].canonicalName).toBe('React Development');
			expect(result.usage?.inputTokens).toBe(100);
			expect(result.usage?.outputTokens).toBe(50);
		});

		it('should parse response from markdown code block', async () => {
			const mockResponse = {
				content: [
					{
						type: 'text',
						text: '```json\n[{"clusterId": "c1", "canonicalName": "Test", "quizzabilityScore": 0.5, "suggestedMerges": [], "misfitNotes": []}]\n```',
					},
				],
				usage: { input_tokens: 50, output_tokens: 30 },
			};

			mockCreate.mockResolvedValueOnce(mockResponse);

			const result = await adapter.nameConceptsBatch({
				clusters: [
					{
						clusterId: 'c1',
						candidateNames: [],
						representativeTitles: [],
						commonTags: [],
						folderPath: '',
						noteCount: 1,
					},
				],
			});

			expect(result.results[0].canonicalName).toBe('Test');
		});
	});

	describe('retry logic', () => {
		it('should retry on 429 rate limit error', async () => {
			// First call fails with rate limit
			mockCreate.mockRejectedValueOnce(createApiError('Rate limited', 429));

			// Second call succeeds
			mockCreate.mockResolvedValueOnce({
				content: [
					{
						type: 'text',
						text: '[{"clusterId": "c1", "canonicalName": "Test", "quizzabilityScore": 0.5, "suggestedMerges": [], "misfitNotes": []}]',
					},
				],
				usage: { input_tokens: 50, output_tokens: 30 },
			});

			const result = await adapter.nameConceptsBatch({
				clusters: [
					{
						clusterId: 'c1',
						candidateNames: [],
						representativeTitles: [],
						commonTags: [],
						folderPath: '',
						noteCount: 1,
					},
				],
			});

			expect(mockCreate).toHaveBeenCalledTimes(2);
			expect(result.results[0].canonicalName).toBe('Test');
		});

		it('should retry on 500 server error', async () => {
			mockCreate.mockRejectedValueOnce(createApiError('Server error', 500));
			mockCreate.mockResolvedValueOnce({
				content: [
					{
						type: 'text',
						text: '[{"clusterId": "c1", "canonicalName": "Test", "quizzabilityScore": 0.5, "suggestedMerges": [], "misfitNotes": []}]',
					},
				],
				usage: { input_tokens: 50, output_tokens: 30 },
			});

			const result = await adapter.nameConceptsBatch({
				clusters: [
					{
						clusterId: 'c1',
						candidateNames: [],
						representativeTitles: [],
						commonTags: [],
						folderPath: '',
						noteCount: 1,
					},
				],
			});

			expect(mockCreate).toHaveBeenCalledTimes(2);
			expect(result.results).toHaveLength(1);
		});

		it('should not retry on 400 bad request', async () => {
			mockCreate.mockRejectedValue(createApiError('Bad request', 400));

			await expect(
				adapter.nameConceptsBatch({
					clusters: [
						{
							clusterId: 'c1',
							candidateNames: [],
							representativeTitles: [],
							commonTags: [],
							folderPath: '',
							noteCount: 1,
						},
					],
				}),
			).rejects.toThrow(LLMApiError);

			expect(mockCreate).toHaveBeenCalledTimes(1);
		});

		it('should exhaust retries and throw', async () => {
			mockCreate.mockRejectedValue(createApiError('Rate limited', 429));

			await expect(
				adapter.nameConceptsBatch({
					clusters: [
						{
							clusterId: 'c1',
							candidateNames: [],
							representativeTitles: [],
							commonTags: [],
							folderPath: '',
							noteCount: 1,
						},
					],
				}),
			).rejects.toThrow(LLMApiError);

			// Initial + 2 retries = 3 calls
			expect(mockCreate).toHaveBeenCalledTimes(3);
		});
	});

	describe('config', () => {
		it('should return config', () => {
			const config = adapter.getConfig();
			expect(config.maxRetries).toBe(2);
			expect(config.model).toBeDefined();
		});

		it('should update config', () => {
			adapter.updateConfig({ temperature: 0.5 });
			const config = adapter.getConfig();
			expect(config.temperature).toBe(0.5);
		});
	});

	describe('error handling', () => {
		it('should throw LLMApiError with status code', async () => {
			mockCreate.mockRejectedValue(createApiError('Unauthorized', 401));

			try {
				await adapter.nameConceptsBatch({
					clusters: [
						{
							clusterId: 'c1',
							candidateNames: [],
							representativeTitles: [],
							commonTags: [],
							folderPath: '',
							noteCount: 1,
						},
					],
				});
				expect.fail('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(LLMApiError);
				expect((error as LLMApiError).statusCode).toBe(401);
				expect((error as LLMApiError).isRetryable).toBe(false);
			}
		});

		it('should throw on empty response', async () => {
			mockCreate.mockResolvedValueOnce({
				content: [],
				usage: { input_tokens: 10, output_tokens: 0 },
			});

			await expect(
				adapter.nameConceptsBatch({
					clusters: [
						{
							clusterId: 'c1',
							candidateNames: [],
							representativeTitles: [],
							commonTags: [],
							folderPath: '',
							noteCount: 1,
						},
					],
				}),
			).rejects.toThrow('No text content');
		});
	});
});
