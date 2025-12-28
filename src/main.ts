import { Notice, Plugin } from 'obsidian';

/**
 * Obsidian AI Recall Plugin
 * AI-powered spaced repetition for Obsidian
 */
export default class AIRecallPlugin extends Plugin {
	async onload(): Promise<void> {
		console.log('Loading AI Recall plugin');

		// Register clustering command (requires embedding setup)
		this.addCommand({
			id: 'run-clustering',
			name: 'Run Note Clustering',
			callback: () => this.runClustering(),
		});
	}

	async onunload(): Promise<void> {
		console.log('Unloading AI Recall plugin');
	}

	private async runClustering(): Promise<void> {
		// TODO: Implement full pipeline with embedding provider setup
		// The clustering pipeline requires:
		// 1. EmbeddingProvider (OpenAI or Voyage)
		// 2. EmbeddingOrchestrator to embed notes
		// 3. ClusteringPipeline to cluster embeddings
		// See scripts/run-full-pipeline.ts for reference implementation
		new Notice('Clustering requires embedding API setup. See plugin settings.');
	}
}
