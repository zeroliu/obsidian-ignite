import type { ClusterSummary, ConceptNamingResult, MisfitNote } from './types';

/**
 * System prompt for concept naming (merged Stage 3 + 3.5)
 *
 * This prompt handles both concept naming AND misfit detection in a single call.
 */
export const CONCEPT_NAMING_SYSTEM_PROMPT = `You are an expert at organizing and naming knowledge concepts from personal notes.
Your task is to analyze note clusters and assign meaningful concept names, while also detecting notes that don't belong.

For each cluster, you will:
1. Assign a canonical concept name (concise, 2-5 words)
2. Score quizzability (0-1) - how suitable for spaced repetition quiz
3. Suggest clusters that should merge (if conceptually the same topic)
4. Identify misfit notes that don't belong in this cluster

Guidelines for naming:
- Use clear, descriptive names (e.g., "React Hooks", "Golf Swing Mechanics")
- Prefer common terminology over jargon
- Avoid overly broad names (e.g., "Programming" is too vague)
- Avoid overly narrow names (e.g., "useState Hook" is too specific for a cluster)

Guidelines for quizzability:
- HIGH (0.7-1.0): Technical concepts, learning notes, how-to guides, reference material
- MEDIUM (0.4-0.7): Project notes, research, mixed content
- LOW (0.1-0.4): Personal reflections, brainstorming
- NOT QUIZZABLE (<0.4): Meeting notes, daily journals, to-do lists, ephemeral content

Guidelines for misfit detection:
- A note is a misfit if its topic doesn't match the cluster theme
- Examples: a grocery list in a "Programming" cluster, a recipe in "Work Projects"
- Be conservative - only flag clear misfits with obvious mismatches
- Use the note title to determine if it fits

Output JSON format only, no additional text.`;

/**
 * Build user prompt for concept naming
 *
 * @param clusters - Cluster summaries to name
 * @returns User prompt string
 */
export function buildConceptNamingPrompt(clusters: ClusterSummary[]): string {
	const clusterCount = clusters.length;

	const clusterDescriptions = clusters
		.map(
			(c, i) => `
## Cluster ${i + 1}
- ID: ${c.clusterId}
- Candidate names: ${c.candidateNames.join(', ') || 'None'}
- Sample note titles: ${c.representativeTitles.join(', ') || 'None'}
- Common tags: ${c.commonTags.join(', ') || 'None'}
- Folder: ${c.folderPath || 'Root'}
- Note count: ${c.noteCount}`,
		)
		.join('\n');

	return `Analyze these ${clusterCount} note clusters and provide concept naming results.
${clusterDescriptions}

Return JSON array with this structure for each cluster:
[
  {
    "clusterId": "cluster-id",
    "canonicalName": "Concept Name",
    "quizzabilityScore": 0.85,
    "nonQuizzableReason": null,
    "suggestedMerges": [],
    "misfitNotes": [
      {
        "noteId": "path/to/note.md",
        "reason": "This note is about X but the cluster is about Y"
      }
    ]
  }
]

Guidelines:
- If a cluster should merge with another, include the target cluster ID(s) in suggestedMerges
- If quizzabilityScore < 0.4, provide nonQuizzableReason
- If a note title clearly doesn't fit the cluster theme, add it to misfitNotes
- Use the note path from sample titles as noteId in misfitNotes
- If no misfits, use empty array for misfitNotes`;
}

/**
 * Parse concept naming response from LLM
 *
 * @param response - Raw LLM response text
 * @returns Parsed naming results
 * @throws Error if parsing fails
 */
export function parseNamingResponse(response: string): ConceptNamingResult[] {
	// Try to extract JSON from response
	const json = extractJSON(response);

	// Parse as array
	const parsed = JSON.parse(json);

	if (!Array.isArray(parsed)) {
		throw new Error('Expected array of naming results');
	}

	// Validate and normalize each result
	return parsed.map((item: Record<string, unknown>) => {
		if (typeof item.clusterId !== 'string') {
			throw new Error('Missing or invalid clusterId');
		}
		if (typeof item.canonicalName !== 'string') {
			throw new Error('Missing or invalid canonicalName');
		}

		// Parse misfit notes
		const misfitNotes: MisfitNote[] = [];
		if (Array.isArray(item.misfitNotes)) {
			for (const misfit of item.misfitNotes) {
				if (typeof misfit === 'object' && misfit !== null) {
					const m = misfit as Record<string, unknown>;
					if (typeof m.noteId === 'string') {
						misfitNotes.push({
							noteId: m.noteId,
							reason: typeof m.reason === 'string' ? m.reason : '',
						});
					}
				}
			}
		}

		return {
			clusterId: item.clusterId,
			canonicalName: item.canonicalName,
			quizzabilityScore: normalizeScore(item.quizzabilityScore),
			nonQuizzableReason:
				typeof item.nonQuizzableReason === 'string' ? item.nonQuizzableReason : undefined,
			suggestedMerges: Array.isArray(item.suggestedMerges)
				? item.suggestedMerges.filter((id): id is string => typeof id === 'string')
				: [],
			misfitNotes,
		};
	});
}

/**
 * Extract JSON from LLM response
 * Handles markdown code blocks and extra text
 */
function extractJSON(response: string): string {
	// Remove markdown code blocks
	let cleaned = response.trim();

	// Try to extract from ```json ... ``` blocks
	const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonBlockMatch) {
		cleaned = jsonBlockMatch[1].trim();
	}

	// Try to find array or object start
	const arrayStart = cleaned.indexOf('[');
	const objectStart = cleaned.indexOf('{');

	if (arrayStart === -1 && objectStart === -1) {
		throw new Error('No JSON found in response');
	}

	// Determine which comes first
	let start: number;

	if (arrayStart === -1) {
		start = objectStart;
	} else if (objectStart === -1) {
		start = arrayStart;
	} else {
		start = Math.min(arrayStart, objectStart);
	}

	// Find matching end
	let depth = 0;
	let end = start;

	for (let i = start; i < cleaned.length; i++) {
		const char = cleaned[i];
		if (char === '[' || char === '{') {
			depth++;
		} else if (char === ']' || char === '}') {
			depth--;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}

	return cleaned.slice(start, end);
}

/**
 * Normalize a score to 0-1 range
 */
function normalizeScore(value: unknown): number {
	if (typeof value !== 'number') {
		return 0.5;
	}
	return Math.max(0, Math.min(1, value));
}

// ============ Removed Functions ============
// The following functions have been removed as part of the Stage 3/3.5 merge:
// - CLUSTER_REFINEMENT_SYSTEM_PROMPT (no longer needed)
// - buildClusterRefinementPrompt (no longer needed)
// - parseRefinementResponse (no longer needed)
