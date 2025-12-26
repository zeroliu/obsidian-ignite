import type { FileInfo } from '@/ports/IVaultProvider';
import { type Cluster, type ClusteringConfig, createCluster } from './types';

/**
 * Language detection result
 */
export type Language = 'en' | 'zh' | 'ja' | 'ko' | 'mixed';

/**
 * CJK stop words - common particles, conjunctions, and function words
 * that don't carry semantic meaning for clustering purposes
 */
const CJK_STOP_WORDS: Record<'zh' | 'ja' | 'ko', Set<string>> = {
	zh: new Set([
		'的',
		'是',
		'在',
		'了',
		'和',
		'有',
		'这',
		'那',
		'我',
		'他',
		'她',
		'它',
		'们',
		'着',
		'过',
		'也',
		'就',
		'都',
		'而',
		'及',
		'与',
		'等',
		'或',
		'不',
		'没',
		'很',
		'最',
		'更',
		'还',
		'把',
		'被',
		'让',
		'给',
	]),
	ja: new Set([
		'の',
		'は',
		'が',
		'を',
		'に',
		'で',
		'と',
		'も',
		'や',
		'か',
		'から',
		'まで',
		'です',
		'ます',
		'する',
		'ある',
		'いる',
	]),
	ko: new Set([
		'은',
		'는',
		'이',
		'가',
		'을',
		'를',
		'에',
		'의',
		'와',
		'과',
		'로',
		'하다',
		'이다',
		'있다',
	]),
};

/**
 * Detect if a cluster contains journal/daily notes by looking for year patterns
 * Returns the detected year if >50% of notes contain it, null otherwise
 */
export function detectJournalYear(noteIds: string[], files: Map<string, FileInfo>): string | null {
	const yearPattern = /\b(20\d{2})\b/;
	const yearCounts = new Map<string, number>();

	for (const noteId of noteIds) {
		const file = files.get(noteId);
		if (file) {
			const match = file.basename.match(yearPattern);
			if (match) {
				const year = match[1];
				yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
			}
		}
	}

	// Find most common year
	let maxYear: string | null = null;
	let maxCount = 0;
	for (const [year, count] of yearCounts) {
		if (count > maxCount) {
			maxCount = count;
			maxYear = year;
		}
	}

	// Return year if >50% of notes contain it
	if (maxYear && maxCount > noteIds.length * 0.5) {
		return maxYear;
	}

	return null;
}

/**
 * Split notes by quarter based on date patterns in titles
 * Supports ISO format (2024-01-15) and month names (Jan, January)
 */
export function splitByQuarter(
	noteIds: string[],
	files: Map<string, FileInfo>,
	year: string,
): Map<string, string[]> {
	const quarters = new Map<string, string[]>();
	quarters.set('Q1', []);
	quarters.set('Q2', []);
	quarters.set('Q3', []);
	quarters.set('Q4', []);
	quarters.set('Unknown', []);

	// Month patterns
	const isoPattern = new RegExp(`${year}-(0[1-9]|1[0-2])`);
	const monthNames: Record<string, number> = {
		jan: 1,
		january: 1,
		feb: 2,
		february: 2,
		mar: 3,
		march: 3,
		apr: 4,
		april: 4,
		may: 5,
		jun: 6,
		june: 6,
		jul: 7,
		july: 7,
		aug: 8,
		august: 8,
		sep: 9,
		september: 9,
		oct: 10,
		october: 10,
		nov: 11,
		november: 11,
		dec: 12,
		december: 12,
	};

	for (const noteId of noteIds) {
		const file = files.get(noteId);
		if (!file) {
			quarters.get('Unknown')?.push(noteId);
			continue;
		}

		const title = file.basename.toLowerCase();
		let month: number | null = null;

		// Try ISO format first
		const isoMatch = title.match(isoPattern);
		if (isoMatch) {
			month = Number.parseInt(isoMatch[1], 10);
		} else {
			// Try month names
			for (const [name, m] of Object.entries(monthNames)) {
				if (title.includes(name)) {
					month = m;
					break;
				}
			}
		}

		if (month !== null) {
			if (month <= 3) quarters.get('Q1')?.push(noteId);
			else if (month <= 6) quarters.get('Q2')?.push(noteId);
			else if (month <= 9) quarters.get('Q3')?.push(noteId);
			else quarters.get('Q4')?.push(noteId);
		} else {
			quarters.get('Unknown')?.push(noteId);
		}
	}

	return quarters;
}

/**
 * Groups notes within a cluster by title keywords
 * Uses TF-IDF for English and Intl.Segmenter for CJK languages
 *
 * @param clusters - Array of clusters to refine
 * @param files - File info map (path -> FileInfo)
 * @param config - Clustering configuration
 * @returns Refined array of clusters
 */
export function groupByTitleKeywords(
	clusters: Cluster[],
	files: Map<string, FileInfo>,
	config: ClusteringConfig,
): Cluster[] {
	const result: Cluster[] = [];

	for (const cluster of clusters) {
		// Check if this is a large journal cluster that should be split by quarter
		if (cluster.noteIds.length > config.maxClusterSize) {
			const journalYear = detectJournalYear(cluster.noteIds, files);
			if (journalYear) {
				const quarterGroups = splitByQuarter(cluster.noteIds, files, journalYear);

				for (const [quarter, notes] of quarterGroups) {
					if (notes.length >= config.minClusterSize) {
						result.push(
							createCluster({
								noteIds: notes,
								folderPath: cluster.folderPath,
								dominantTags: cluster.dominantTags,
								candidateNames: [`${journalYear} ${quarter}`, ...cluster.candidateNames],
								reasons: [
									...cluster.reasons,
									`Split journal by quarter: ${journalYear} ${quarter} (${notes.length} notes)`,
								],
							}),
						);
					} else if (notes.length > 0) {
						// Add to result as-is for merging later
						result.push(
							createCluster({
								noteIds: notes,
								folderPath: cluster.folderPath,
								dominantTags: cluster.dominantTags,
								candidateNames: [`${journalYear} ${quarter}`, ...cluster.candidateNames],
								reasons: [
									...cluster.reasons,
									`Split journal by quarter: ${journalYear} ${quarter} (${notes.length} notes)`,
								],
							}),
						);
					}
				}
				continue;
			}
		}

		// Extract titles and keywords
		const noteTitles = new Map<string, string>();
		for (const noteId of cluster.noteIds) {
			const file = files.get(noteId);
			if (file) {
				noteTitles.set(noteId, file.basename);
			}
		}

		// Extract keywords for each note
		const noteKeywords = new Map<string, string[]>();
		for (const [noteId, title] of noteTitles) {
			const keywords = extractTitleKeywords(title);
			noteKeywords.set(noteId, keywords);
		}

		// Calculate TF-IDF scores for keywords
		const keywordScores = calculateKeywordScores(noteKeywords);

		// Group notes by their most significant keyword
		const groups = groupByTopKeyword(cluster.noteIds, noteKeywords, keywordScores);

		// Filter groups by minimum size
		const significantGroups = Array.from(groups.entries()).filter(
			([, noteIds]) => noteIds.length >= config.minClusterSize,
		);

		// If we have multiple significant groups, split
		if (significantGroups.length > 1) {
			for (const [keyword, noteIds] of significantGroups) {
				result.push(
					createCluster({
						noteIds,
						folderPath: cluster.folderPath,
						dominantTags: cluster.dominantTags,
						candidateNames: [...cluster.candidateNames, formatKeywordAsName(keyword)],
						reasons: [
							...cluster.reasons,
							`Split by title keyword: '${keyword}' (${noteIds.length} notes)`,
						],
					}),
				);
			}

			// Handle orphans
			const groupedNotes = new Set(significantGroups.flatMap(([, ids]) => ids));
			const orphans = cluster.noteIds.filter((id) => !groupedNotes.has(id));
			if (orphans.length > 0) {
				result.push(
					createCluster({
						noteIds: orphans,
						folderPath: cluster.folderPath,
						dominantTags: cluster.dominantTags,
						candidateNames: [...cluster.candidateNames, 'Other'],
						reasons: [
							...cluster.reasons,
							`Notes without matching title keywords (${orphans.length} notes)`,
						],
					}),
				);
			}
		} else {
			// Keep original cluster
			result.push(cluster);
		}
	}

	return result;
}

/**
 * Extract keywords from a title
 * Uses Intl.Segmenter for CJK, simple tokenization for English
 * Handles mixed language titles by extracting from both portions
 */
export function extractTitleKeywords(title: string): string[] {
	const lang = detectLanguage(title);

	if (lang === 'mixed') {
		// Extract from BOTH portions, dedupe
		const cjkLang = detectCJKLanguage(title);
		const cjkKeywords = filterCJKStopWords(segmentCJK(title, cjkLang), cjkLang);
		const englishKeywords = extractEnglishKeywords(title);
		return [...new Set([...cjkKeywords, ...englishKeywords])];
	}

	if (isCJK(lang)) {
		return filterCJKStopWords(segmentCJK(title, lang), lang);
	}

	return extractEnglishKeywords(title);
}

/**
 * Detect the primary language of a string
 */
export function detectLanguage(text: string): Language {
	// Count characters by type
	let cjkCount = 0;
	let latinCount = 0;

	for (const char of text) {
		if (isCJKCharacter(char)) {
			cjkCount++;
		} else if (/[a-zA-Z]/.test(char)) {
			latinCount++;
		}
	}

	const total = cjkCount + latinCount;
	if (total === 0) return 'en';

	const cjkRatio = cjkCount / total;

	if (cjkRatio > 0.5) {
		// Determine which CJK language
		return detectCJKLanguage(text);
	}

	if (latinCount > 0 && cjkCount > 0) {
		return 'mixed';
	}

	return 'en';
}

/**
 * Check if a character is a CJK character
 */
function isCJKCharacter(char: string): boolean {
	const code = char.charCodeAt(0);
	return (
		// CJK Unified Ideographs
		(code >= 0x4e00 && code <= 0x9fff) ||
		// CJK Extension A
		(code >= 0x3400 && code <= 0x4dbf) ||
		// Hiragana
		(code >= 0x3040 && code <= 0x309f) ||
		// Katakana
		(code >= 0x30a0 && code <= 0x30ff) ||
		// Korean Hangul
		(code >= 0xac00 && code <= 0xd7af) ||
		// Korean Jamo
		(code >= 0x1100 && code <= 0x11ff)
	);
}

/**
 * Detect which CJK language based on character distribution
 */
function detectCJKLanguage(text: string): Language {
	let hiraganaKatakana = 0;
	let hangul = 0;

	for (const char of text) {
		const code = char.charCodeAt(0);
		if (
			(code >= 0x3040 && code <= 0x309f) || // Hiragana
			(code >= 0x30a0 && code <= 0x30ff) // Katakana
		) {
			hiraganaKatakana++;
		} else if (
			(code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
			(code >= 0x1100 && code <= 0x11ff) // Hangul Jamo
		) {
			hangul++;
		}
	}

	if (hiraganaKatakana > 0) return 'ja';
	if (hangul > 0) return 'ko';
	return 'zh';
}

/**
 * Check if language is CJK
 */
export function isCJK(lang: Language): boolean {
	return lang === 'zh' || lang === 'ja' || lang === 'ko';
}

/**
 * Segment CJK text using Intl.Segmenter
 */
export function segmentCJK(text: string, lang: Language): string[] {
	const locale = lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja' : 'ko';

	try {
		const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
		const segments = segmenter.segment(text);

		const words: string[] = [];
		for (const segment of segments) {
			// Filter out whitespace and punctuation
			const word = segment.segment.trim();
			if (word.length > 0 && !isPunctuation(word)) {
				words.push(word.toLowerCase());
			}
		}

		return words;
	} catch {
		// Fallback: character-based segmentation for very old environments
		return fallbackCJKSegmentation(text);
	}
}

/**
 * Fallback CJK segmentation (character-based)
 */
function fallbackCJKSegmentation(text: string): string[] {
	const words: string[] = [];
	let current = '';

	for (const char of text) {
		if (isCJKCharacter(char)) {
			// For CJK, each character can be a word (simplified approach)
			if (current.length > 0) {
				words.push(current.toLowerCase());
				current = '';
			}
			words.push(char);
		} else if (/[a-zA-Z0-9]/.test(char)) {
			current += char;
		} else if (current.length > 0) {
			words.push(current.toLowerCase());
			current = '';
		}
	}

	if (current.length > 0) {
		words.push(current.toLowerCase());
	}

	return words;
}

/**
 * Check if a string is punctuation
 */
function isPunctuation(str: string): boolean {
	return /^[\s\p{P}]+$/u.test(str);
}

/**
 * Filter out CJK stop words from a list of words
 */
export function filterCJKStopWords(words: string[], lang: Language): string[] {
	if (lang !== 'zh' && lang !== 'ja' && lang !== 'ko') {
		return words;
	}
	const stopWords = CJK_STOP_WORDS[lang];
	return words.filter((word) => !stopWords.has(word));
}

/**
 * Extract English keywords from a title
 */
export function extractEnglishKeywords(title: string): string[] {
	// Common English stop words
	const stopWords = new Set([
		'a',
		'an',
		'the',
		'and',
		'or',
		'but',
		'in',
		'on',
		'at',
		'to',
		'for',
		'of',
		'with',
		'by',
		'from',
		'as',
		'is',
		'was',
		'are',
		'were',
		'been',
		'be',
		'have',
		'has',
		'had',
		'do',
		'does',
		'did',
		'will',
		'would',
		'could',
		'should',
		'may',
		'might',
		'must',
		'shall',
		'can',
		'need',
		'i',
		'you',
		'he',
		'she',
		'it',
		'we',
		'they',
		'my',
		'your',
		'his',
		'her',
		'its',
		'our',
		'their',
		'this',
		'that',
		'these',
		'those',
		'what',
		'which',
		'who',
		'whom',
		'how',
		'when',
		'where',
		'why',
	]);

	return (
		title
			.toLowerCase()
			// Split on non-alphanumeric characters
			.split(/[^a-z0-9]+/)
			// Filter stop words and short words
			.filter((word) => word.length > 2 && !stopWords.has(word))
	);
}

/**
 * Calculate scores for keywords based on their potential to form clusters
 * A good cluster keyword should:
 * - Appear in multiple documents (not unique to one doc)
 * - Not appear in all documents (some distinctiveness)
 * Returns map of keyword -> score
 */
export function calculateKeywordScores(noteKeywords: Map<string, string[]>): Map<string, number> {
	// Count document frequency for each keyword
	const documentFrequency = new Map<string, number>();
	const totalDocs = noteKeywords.size;

	for (const keywords of noteKeywords.values()) {
		const uniqueKeywords = new Set(keywords);
		for (const keyword of uniqueKeywords) {
			documentFrequency.set(keyword, (documentFrequency.get(keyword) || 0) + 1);
		}
	}

	// Calculate scores favoring keywords that can form clusters
	const scores = new Map<string, number>();
	for (const [keyword, df] of documentFrequency) {
		// Skip keywords that only appear once (can't form a cluster)
		if (df < 2) {
			scores.set(keyword, 0);
			continue;
		}

		// Favor keywords that appear in moderate number of docs
		// Peak score at around 30-50% of docs
		const ratio = df / totalDocs;

		// Score formula: higher when keyword appears in 20-60% of docs
		// df^0.5 rewards keywords that appear multiple times
		// (1 - ratio) prevents keywords that are too common
		const score = Math.sqrt(df) * (1 - Math.abs(ratio - 0.4));

		scores.set(keyword, score);
	}

	return scores;
}

/**
 * Group notes by their most significant keyword
 */
function groupByTopKeyword(
	noteIds: string[],
	noteKeywords: Map<string, string[]>,
	keywordScores: Map<string, number>,
): Map<string, string[]> {
	const groups = new Map<string, string[]>();

	for (const noteId of noteIds) {
		const keywords = noteKeywords.get(noteId) || [];

		// Find the keyword with the highest score
		let topKeyword = '';
		let topScore = 0;

		for (const keyword of keywords) {
			const score = keywordScores.get(keyword) || 0;
			if (score > topScore) {
				topScore = score;
				topKeyword = keyword;
			}
		}

		if (topKeyword) {
			const group = groups.get(topKeyword) || [];
			group.push(noteId);
			groups.set(topKeyword, group);
		}
	}

	return groups;
}

/**
 * Format a keyword as a cluster name
 */
function formatKeywordAsName(keyword: string): string {
	return keyword.charAt(0).toUpperCase() + keyword.slice(1);
}
