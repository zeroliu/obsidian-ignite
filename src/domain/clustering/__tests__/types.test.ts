import { describe, expect, it } from 'vitest';
import { createCluster, generateClusterId } from '../types';

describe('generateClusterId', () => {
	it('should generate a string starting with "cluster-"', () => {
		const id = generateClusterId();
		expect(id).toMatch(/^cluster-/);
	});

	it('should generate unique IDs on each call', () => {
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generateClusterId());
		}
		expect(ids.size).toBe(100);
	});

	it('should include a timestamp component', () => {
		const before = Date.now();
		const id = generateClusterId();
		const after = Date.now();

		// Extract timestamp from ID (format: cluster-{timestamp}-{random})
		const parts = id.split('-');
		const timestamp = Number(parts[1]);

		expect(timestamp).toBeGreaterThanOrEqual(before);
		expect(timestamp).toBeLessThanOrEqual(after);
	});
});

describe('createCluster', () => {
	it('should create a cluster with only noteIds provided', () => {
		const cluster = createCluster({ noteIds: ['note1.md', 'note2.md'] });

		expect(cluster.noteIds).toEqual(['note1.md', 'note2.md']);
		expect(cluster.id).toMatch(/^cluster-/);
		expect(cluster.candidateNames).toEqual([]);
		expect(cluster.dominantTags).toEqual([]);
		expect(cluster.folderPath).toBe('');
		expect(cluster.internalLinkDensity).toBe(0);
		expect(cluster.reasons).toEqual([]);
		expect(cluster.createdAt).toBeGreaterThan(0);
	});

	it('should use provided id instead of generating one', () => {
		const cluster = createCluster({
			id: 'custom-id',
			noteIds: ['note.md'],
		});

		expect(cluster.id).toBe('custom-id');
	});

	it('should use provided values for optional fields', () => {
		const cluster = createCluster({
			noteIds: ['note.md'],
			candidateNames: ['Topic A', 'Topic B'],
			dominantTags: ['#tag1', '#tag2'],
			folderPath: 'folder/subfolder',
			internalLinkDensity: 0.75,
			createdAt: 1234567890,
			reasons: ['shared folder', 'high link density'],
		});

		expect(cluster.candidateNames).toEqual(['Topic A', 'Topic B']);
		expect(cluster.dominantTags).toEqual(['#tag1', '#tag2']);
		expect(cluster.folderPath).toBe('folder/subfolder');
		expect(cluster.internalLinkDensity).toBe(0.75);
		expect(cluster.createdAt).toBe(1234567890);
		expect(cluster.reasons).toEqual(['shared folder', 'high link density']);
	});

	it('should handle empty noteIds array', () => {
		const cluster = createCluster({ noteIds: [] });

		expect(cluster.noteIds).toEqual([]);
		expect(cluster.id).toMatch(/^cluster-/);
	});
});
