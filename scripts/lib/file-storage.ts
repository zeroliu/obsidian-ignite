/**
 * File-based storage adapter for scripts
 *
 * Stores data as JSON files in a specified directory.
 * Keys are converted to file paths (e.g., "embeddings/index" -> "embeddings/index.json")
 */

import {existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import type {IStorageAdapter} from '../../src/ports/IStorageAdapter';

/**
 * File-based implementation of IStorageAdapter
 */
export class FileStorageAdapter implements IStorageAdapter {
	private baseDir: string;

	constructor(baseDir: string) {
		this.baseDir = baseDir;
		// Ensure base directory exists
		if (!existsSync(baseDir)) {
			mkdirSync(baseDir, {recursive: true});
		}
	}

	private getFilePath(key: string): string {
		return join(this.baseDir, `${key}.json`);
	}

	async read<T>(key: string): Promise<T | null> {
		const filePath = this.getFilePath(key);
		if (!existsSync(filePath)) {
			return null;
		}
		try {
			const content = readFileSync(filePath, 'utf-8');
			return JSON.parse(content) as T;
		} catch {
			return null;
		}
	}

	async write<T>(key: string, data: T): Promise<void> {
		const filePath = this.getFilePath(key);
		const dir = dirname(filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, {recursive: true});
		}
		writeFileSync(filePath, JSON.stringify(data));
	}

	async exists(key: string): Promise<boolean> {
		return existsSync(this.getFilePath(key));
	}

	async delete(key: string): Promise<void> {
		const filePath = this.getFilePath(key);
		if (existsSync(filePath)) {
			unlinkSync(filePath);
		}
	}

	async keys(): Promise<string[]> {
		return this.collectKeys(this.baseDir, '');
	}

	private collectKeys(dir: string, prefix: string): string[] {
		if (!existsSync(dir)) {
			return [];
		}

		const keys: string[] = [];
		const entries = readdirSync(dir, {withFileTypes: true});

		for (const entry of entries) {
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

			if (entry.isDirectory()) {
				keys.push(...this.collectKeys(join(dir, entry.name), relativePath));
			} else if (entry.isFile() && entry.name.endsWith('.json')) {
				// Remove .json extension to get the key
				keys.push(relativePath.slice(0, -5));
			}
		}

		return keys;
	}

	async clear(): Promise<void> {
		if (existsSync(this.baseDir)) {
			rmSync(this.baseDir, {recursive: true, force: true});
			mkdirSync(this.baseDir, {recursive: true});
		}
	}
}
