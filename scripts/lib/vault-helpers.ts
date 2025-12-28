/**
 * Shared vault helper utilities for scripts
 *
 * Common functions used across multiple scripts for reading and parsing vault files.
 */

import 'dotenv/config';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import type {FileInfo} from '../../src/ports/IVaultProvider';
import type {ResolvedLinks} from '../../src/ports/IMetadataProvider';

/**
 * Minimum word count threshold for non-stub notes.
 * Notes with fewer words than this are considered stubs.
 */
export const STUB_WORD_THRESHOLD = 50;

/**
 * Recursively find all markdown files in a directory
 *
 * @param dir - Directory to search
 * @param baseDir - Base directory for relative paths (defaults to dir)
 * @returns Array of absolute file paths
 */
export function findMarkdownFiles(dir: string, baseDir: string = dir): string[] {
	const files: string[] = [];
	const entries = readdirSync(dir, {withFileTypes: true});

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		// Skip hidden directories and common non-content folders
		if (entry.name.startsWith('.') || entry.name === 'node_modules') {
			continue;
		}

		if (entry.isDirectory()) {
			files.push(...findMarkdownFiles(fullPath, baseDir));
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * Parse YAML frontmatter from markdown content
 *
 * @param content - Markdown file content
 * @returns Parsed frontmatter as key-value pairs
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return {};

	const yamlContent = match[1];
	const frontmatter: Record<string, unknown> = {};
	const lines = yamlContent.split('\n');

	for (const line of lines) {
		const colonIndex = line.indexOf(':');
		if (colonIndex > 0) {
			const key = line.slice(0, colonIndex).trim();
			const value = line.slice(colonIndex + 1).trim();
			if (value.startsWith('[') && value.endsWith(']')) {
				frontmatter[key] = value
					.slice(1, -1)
					.split(',')
					.map((s) => s.trim().replace(/^["']|["']$/g, ''))
					.filter(Boolean);
			} else {
				frontmatter[key] = value.replace(/^["']|["']$/g, '');
			}
		}
	}

	return frontmatter;
}

/**
 * Extract tags from markdown content and frontmatter
 *
 * @param content - Markdown file content
 * @param frontmatter - Parsed frontmatter object
 * @returns Array of normalized tags (with # prefix)
 */
export function extractTags(content: string, frontmatter: Record<string, unknown>): string[] {
	const tags = new Set<string>();

	// From frontmatter
	if (frontmatter.tags) {
		const fmTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
		for (const tag of fmTags) {
			const normalized = String(tag).startsWith('#') ? String(tag) : `#${String(tag)}`;
			tags.add(normalized);
		}
	}

	// Inline tags (excluding code blocks)
	const withoutCode = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
	const inlineTagRegex = /(?<![`\w])#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
	let match: RegExpExecArray | null;
	while ((match = inlineTagRegex.exec(withoutCode)) !== null) {
		tags.add(`#${match[1]}`);
	}

	return Array.from(tags);
}

/**
 * Extract wiki-style links from markdown content
 *
 * @param content - Markdown file content
 * @returns Array of link targets (without aliases or heading references)
 */
export function extractLinks(content: string): string[] {
	const links = new Set<string>();
	const wikiLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

	let match: RegExpExecArray | null;
	while ((match = wikiLinkRegex.exec(content)) !== null) {
		let link = match[1].trim();
		const hashIndex = link.indexOf('#');
		if (hashIndex > 0) link = link.slice(0, hashIndex);
		else if (hashIndex === 0) continue;
		if (link) links.add(link);
	}

	return Array.from(links);
}

/**
 * Build resolved links map from file list and raw links
 *
 * @param files - List of file paths
 * @param linksMap - Map of file path to extracted link targets
 * @returns ResolvedLinks object mapping source files to target files with counts
 */
export function buildResolvedLinks(
	files: string[],
	linksMap: Map<string, string[]>,
): ResolvedLinks {
	const resolvedLinks: ResolvedLinks = {};

	// Build basename to path map (prefer shorter paths for duplicates)
	const basenameToPath: Record<string, string> = {};
	for (const filePath of files) {
		const name = basename(filePath, '.md');
		if (!basenameToPath[name] || filePath.length < basenameToPath[name].length) {
			basenameToPath[name] = filePath;
		}
	}

	for (const filePath of files) {
		const links = linksMap.get(filePath) || [];
		if (links.length === 0) continue;

		const linkCounts: Record<string, number> = {};

		for (const link of links) {
			let resolved: string | null = null;
			if (files.includes(link) || files.includes(`${link}.md`)) {
				resolved = files.includes(link) ? link : `${link}.md`;
			} else {
				resolved = basenameToPath[link] || null;
			}

			if (resolved) {
				linkCounts[resolved] = (linkCounts[resolved] || 0) + 1;
			}
		}

		if (Object.keys(linkCounts).length > 0) {
			resolvedLinks[filePath] = linkCounts;
		}
	}

	return resolvedLinks;
}

/**
 * Check if a note is a stub (has too few words)
 *
 * @param content - Markdown file content
 * @returns true if the note has fewer than STUB_WORD_THRESHOLD words
 */
export function isStubNote(content: string): boolean {
	// Remove frontmatter and code blocks
	const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	const withoutCode = withoutFrontmatter.replace(/```[\s\S]*?```/g, '');
	const words = withoutCode.split(/\s+/).filter((w) => w.length > 0);
	return words.length < STUB_WORD_THRESHOLD;
}

/**
 * Get a command line argument value by name
 *
 * @param args - Command line arguments array
 * @param name - Argument name (e.g., '--output')
 * @returns The argument value, or undefined if not found
 */
export function getArg(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index !== -1 && args[index + 1]) {
		return args[index + 1];
	}
	return undefined;
}

/**
 * Get the test vault path from the TEST_VAULT_PATH environment variable.
 * Throws an error if the environment variable is not set.
 *
 * @returns The resolved vault path
 * @throws Error if TEST_VAULT_PATH is not set or the path doesn't exist
 */
export function requireTestVaultPath(): string {
	const vaultPath = process.env.TEST_VAULT_PATH;
	if (!vaultPath) {
		console.error('Error: TEST_VAULT_PATH environment variable is required');
		console.error('');
		console.error('Set it to your Obsidian vault path:');
		console.error('  export TEST_VAULT_PATH=~/Documents/MyVault');
		console.error('');
		console.error('Or pass it inline:');
		console.error('  TEST_VAULT_PATH=~/Documents/MyVault npx tsx scripts/...');
		process.exit(1);
	}

	const {resolve} = require('node:path');
	const {existsSync} = require('node:fs');

	// Expand ~ to home directory
	const expandedPath = vaultPath.replace(/^~/, process.env.HOME || '');
	const resolvedPath = resolve(expandedPath);

	if (!existsSync(resolvedPath)) {
		console.error(`Error: Vault path does not exist: ${resolvedPath}`);
		process.exit(1);
	}

	return resolvedPath;
}

/**
 * Result of reading a vault
 */
export interface VaultReadResult {
	/** Map of relative path to FileInfo */
	files: Map<string, FileInfo>;
	/** Map of relative path to file content */
	contents: Map<string, string>;
	/** Map of relative path to extracted tags */
	noteTags: Map<string, string[]>;
	/** Resolved links between files */
	resolvedLinks: ResolvedLinks;
	/** List of stub note paths */
	stubs: string[];
}

/**
 * Read and parse all markdown files in a vault
 *
 * @param vaultPath - Absolute path to the vault directory
 * @returns VaultReadResult with parsed data for all non-stub notes
 */
export function readVault(vaultPath: string): VaultReadResult {
	const allFilePaths = findMarkdownFiles(vaultPath);

	const files: Map<string, FileInfo> = new Map();
	const contents: Map<string, string> = new Map();
	const noteTags: Map<string, string[]> = new Map();
	const linksMap: Map<string, string[]> = new Map();
	const stubs: string[] = [];

	for (const fullPath of allFilePaths) {
		const relativePath = fullPath.replace(vaultPath + '/', '');
		const content = readFileSync(fullPath, 'utf-8');
		const stats = statSync(fullPath);

		// Check if stub
		if (isStubNote(content)) {
			stubs.push(relativePath);
			continue;
		}

		files.set(relativePath, {
			path: relativePath,
			basename: basename(fullPath, '.md'),
			folder: dirname(relativePath) === '.' ? '' : dirname(relativePath),
			modifiedAt: stats.mtimeMs,
			createdAt: stats.birthtimeMs,
		});

		contents.set(relativePath, content);

		const frontmatter = parseFrontmatter(content);
		noteTags.set(relativePath, extractTags(content, frontmatter));
		linksMap.set(relativePath, extractLinks(content));
	}

	const relativePaths = Array.from(files.keys());
	const resolvedLinks = buildResolvedLinks(relativePaths, linksMap);

	return {
		files,
		contents,
		noteTags,
		resolvedLinks,
		stubs,
	};
}
