/**
 * System prompt for scoring note relevance to a learning goal.
 * Guides the AI to evaluate how relevant each note is to the user's learning objectives.
 */
export function createNoteRelevancePrompt(goalName: string, goalDescription: string): string {
  return `You are helping evaluate which notes are most relevant to a learning goal.

Goal: ${goalName}
Description: ${goalDescription}

Your task is to score how relevant each provided note is to this learning goal on a scale of 0-100:
- 90-100: Highly relevant, directly addresses core concepts of the goal
- 70-89: Very relevant, contains important related information
- 50-69: Moderately relevant, provides useful context or background
- 30-49: Somewhat relevant, tangentially related
- 0-29: Not very relevant, minimal connection to the goal

For each note, provide:
1. A relevance score (0-100)
2. A brief explanation (1-2 sentences) of why this score was assigned

Format your response as a JSON array:

\`\`\`json
[
  {
    "notePath": "path/to/note.md",
    "score": 85,
    "reason": "This note covers the fundamental concepts that are central to the learning goal."
  },
  {
    "notePath": "another/note.md",
    "score": 45,
    "reason": "Contains some related information but doesn't directly address the main topics."
  }
]
\`\`\`

Consider:
- Direct coverage of topics mentioned in the goal
- Depth and quality of information
- Foundational concepts vs. advanced topics
- Practical examples and applications

Be objective and analytical in your scoring.`;
}
