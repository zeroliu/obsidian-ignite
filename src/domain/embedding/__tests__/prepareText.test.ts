import { describe, expect, it } from 'vitest';
import {
	estimateTokens,
	generateContentHash,
	hashString,
	normalizeWhitespace,
	prepareTextForEmbedding,
	stripFrontmatter,
	stripImages,
	summarizeCodeBlocks,
	truncateToTokenLimit,
} from '../prepareText';

describe('prepareTextForEmbedding', () => {
	it('should apply all transformations by default', () => {
		const content = `---
title: Test Note
tags: [test]
---

# Hello World

This is a test note.

\`\`\`typescript
const x = 1;
console.log(x);
\`\`\`

![My Image](./image.png)

More content here.`;

		const result = prepareTextForEmbedding(content);

		expect(result).not.toContain('---');
		expect(result).not.toContain('title: Test Note');
		expect(result).toContain('[code: typescript]');
		expect(result).not.toContain('const x = 1');
		expect(result).toContain('[image: My Image]');
		expect(result).not.toContain('./image.png');
		expect(result).toContain('Hello World');
		expect(result).toContain('More content here');
	});

	it('should respect config options', () => {
		const content = `---
title: Keep Me
---

# Test

\`\`\`js
code here
\`\`\`

![alt](url)`;

		const result = prepareTextForEmbedding(content, {
			stripFrontmatter: false,
			summarizeCode: false,
			stripImages: false,
		});

		expect(result).toContain('title: Keep Me');
		expect(result).toContain('code here');
		expect(result).toContain('![alt](url)');
	});
});

describe('stripFrontmatter', () => {
	it('should remove YAML frontmatter', () => {
		const content = `---
title: My Note
date: 2024-01-01
tags: [a, b, c]
---

# Content starts here`;

		const result = stripFrontmatter(content);

		expect(result).not.toContain('title: My Note');
		expect(result).not.toContain('date:');
		expect(result).toContain('# Content starts here');
	});

	it('should handle content without frontmatter', () => {
		const content = '# Just Content\n\nNo frontmatter here.';
		const result = stripFrontmatter(content);
		expect(result).toBe(content);
	});

	it('should only remove frontmatter at document start', () => {
		const content = `# Title

---
This is a horizontal rule, not frontmatter
---

More content`;

		const result = stripFrontmatter(content);
		expect(result).toContain('---');
		expect(result).toContain('This is a horizontal rule');
	});

	it('should handle Windows line endings', () => {
		const content = '---\r\ntitle: Test\r\n---\r\n\r\nContent';
		const result = stripFrontmatter(content);
		expect(result.trim()).toBe('Content');
	});

	it('should handle empty frontmatter', () => {
		const content = '---\n---\n\nContent here';
		const result = stripFrontmatter(content);
		expect(result.trim()).toBe('Content here');
	});
});

describe('summarizeCodeBlocks', () => {
	it('should summarize code blocks with language', () => {
		const content = `Some text

\`\`\`typescript
const x = 1;
const y = 2;
console.log(x + y);
\`\`\`

More text`;

		const result = summarizeCodeBlocks(content);

		expect(result).toContain('[code: typescript]');
		expect(result).not.toContain('const x = 1');
		expect(result).toContain('Some text');
		expect(result).toContain('More text');
	});

	it('should handle code blocks without language', () => {
		const content = '```\nsome code\n```';
		const result = summarizeCodeBlocks(content);
		expect(result).toBe('[code: code]');
	});

	it('should handle multiple code blocks', () => {
		const content = `\`\`\`js
code1
\`\`\`

text

\`\`\`python
code2
\`\`\``;

		const result = summarizeCodeBlocks(content);

		expect(result).toContain('[code: js]');
		expect(result).toContain('[code: python]');
		expect(result).not.toContain('code1');
		expect(result).not.toContain('code2');
	});

	it('should handle various languages', () => {
		const languages = ['js', 'py', 'rust', 'go', 'java', 'cpp', 'sql', 'bash'];

		for (const lang of languages) {
			const content = `\`\`\`${lang}\ncode\n\`\`\``;
			const result = summarizeCodeBlocks(content);
			expect(result).toBe(`[code: ${lang}]`);
		}
	});

	it('should preserve inline code', () => {
		const content = 'Use `const` for constants and `let` for variables.';
		const result = summarizeCodeBlocks(content);
		expect(result).toBe(content);
	});
});

describe('stripImages', () => {
	it('should replace images with alt text placeholder', () => {
		const content = 'Check out this image: ![My Screenshot](./screenshot.png)';
		const result = stripImages(content);
		expect(result).toBe('Check out this image: [image: My Screenshot]');
	});

	it('should handle images without alt text', () => {
		const content = '![](./image.png)';
		const result = stripImages(content);
		expect(result).toBe('[image: image]');
	});

	it('should handle images with title', () => {
		const content = '![Alt Text](./image.png "Image Title")';
		const result = stripImages(content);
		expect(result).toBe('[image: Alt Text]');
	});

	it('should handle multiple images', () => {
		const content = '![img1](a.png) and ![img2](b.png)';
		const result = stripImages(content);
		expect(result).toBe('[image: img1] and [image: img2]');
	});

	it('should handle images with complex URLs', () => {
		const content = '![Photo](https://example.com/path/to/image.jpg?size=large)';
		const result = stripImages(content);
		expect(result).toBe('[image: Photo]');
	});

	it('should preserve regular links', () => {
		const content = 'Visit [my site](https://example.com)';
		const result = stripImages(content);
		expect(result).toBe(content);
	});
});

describe('normalizeWhitespace', () => {
	it('should collapse multiple newlines', () => {
		const content = 'Line 1\n\n\n\n\nLine 2';
		const result = normalizeWhitespace(content);
		expect(result).toBe('Line 1\n\nLine 2');
	});

	it('should collapse multiple spaces', () => {
		const content = 'Word1    Word2     Word3';
		const result = normalizeWhitespace(content);
		expect(result).toBe('Word1 Word2 Word3');
	});

	it('should normalize Windows line endings', () => {
		const content = 'Line 1\r\nLine 2\r\nLine 3';
		const result = normalizeWhitespace(content);
		expect(result).toBe('Line 1\nLine 2\nLine 3');
	});

	it('should trim leading/trailing whitespace', () => {
		const content = '   \n\n  Content here  \n\n   ';
		const result = normalizeWhitespace(content);
		expect(result).toBe('Content here');
	});

	it('should remove leading spaces from lines', () => {
		const content = '  Line 1\n    Line 2\n  Line 3';
		const result = normalizeWhitespace(content);
		expect(result).toBe('Line 1\nLine 2\nLine 3');
	});
});

describe('estimateTokens', () => {
	it('should estimate tokens for English text', () => {
		// ~4 chars per token
		const text = 'This is a simple test sentence.'; // 32 chars
		const tokens = estimateTokens(text);
		expect(tokens).toBeGreaterThanOrEqual(6);
		expect(tokens).toBeLessThanOrEqual(12);
	});

	it('should estimate tokens for CJK text', () => {
		// ~1.5 chars per token
		const text = '这是一个中文测试句子'; // 10 CJK chars
		const tokens = estimateTokens(text);
		expect(tokens).toBeGreaterThanOrEqual(5);
		expect(tokens).toBeLessThanOrEqual(10);
	});

	it('should handle mixed content', () => {
		const text = 'Hello 世界 World 你好';
		const tokens = estimateTokens(text);
		expect(tokens).toBeGreaterThan(0);
	});

	it('should return 0 for empty text', () => {
		expect(estimateTokens('')).toBe(0);
	});

	it('should handle Japanese text', () => {
		const text = 'これは日本語のテストです';
		const tokens = estimateTokens(text);
		expect(tokens).toBeGreaterThan(0);
	});

	it('should handle Korean text', () => {
		const text = '이것은 한국어 테스트입니다';
		const tokens = estimateTokens(text);
		expect(tokens).toBeGreaterThan(0);
	});
});

describe('truncateToTokenLimit', () => {
	it('should not truncate text under limit', () => {
		const text = 'Short text';
		const result = truncateToTokenLimit(text, 1000);
		expect(result).toBe(text);
	});

	it('should truncate text over limit', () => {
		const text = 'Word '.repeat(1000); // Many words
		const result = truncateToTokenLimit(text, 50);
		expect(result.length).toBeLessThan(text.length);
		expect(result).toContain('[content truncated]');
	});

	it('should prefer paragraph boundaries', () => {
		const text =
			'First paragraph content here.\n\nSecond paragraph.\n\nThird paragraph with more content that exceeds the limit.';
		const result = truncateToTokenLimit(text, 15);
		// Should truncate at a natural break point
		expect(result).toContain('[content truncated]');
	});

	it('should prefer sentence boundaries', () => {
		const text =
			'First sentence. Second sentence. Third sentence. Fourth sentence which is very long and will cause truncation.';
		const result = truncateToTokenLimit(text, 20);
		expect(result).toContain('[content truncated]');
	});

	it('should handle CJK sentence endings', () => {
		const text = '这是第一句。这是第二句。这是第三句。这是第四句，这句话非常长，需要截断。';
		const result = truncateToTokenLimit(text, 10);
		expect(result).toContain('[content truncated]');
	});
});

describe('generateContentHash', () => {
	it('should produce consistent hash for same content', () => {
		const content = 'Test content here';
		const hash1 = generateContentHash(content);
		const hash2 = generateContentHash(content);
		expect(hash1).toBe(hash2);
	});

	it('should produce different hash for different content', () => {
		const hash1 = generateContentHash('Content A');
		const hash2 = generateContentHash('Content B');
		expect(hash1).not.toBe(hash2);
	});

	it('should normalize whitespace differences', () => {
		const hash1 = generateContentHash('Hello   World');
		const hash2 = generateContentHash('Hello World');
		expect(hash1).toBe(hash2);
	});

	it('should handle long content efficiently', () => {
		const longContent = 'x'.repeat(10000);
		const hash = generateContentHash(longContent);
		expect(hash).toBeDefined();
		expect(hash.length).toBe(8); // 32-bit hex
	});

	it('should differentiate content with same start but different length', () => {
		const content1 = 'a'.repeat(100);
		const content2 = 'a'.repeat(200);
		const hash1 = generateContentHash(content1);
		const hash2 = generateContentHash(content2);
		expect(hash1).not.toBe(hash2);
	});
});

describe('hashString', () => {
	it('should produce 8-character hex string', () => {
		const hash = hashString('test');
		expect(hash).toMatch(/^[0-9a-f]{8}$/);
	});

	it('should be deterministic', () => {
		const hash1 = hashString('same input');
		const hash2 = hashString('same input');
		expect(hash1).toBe(hash2);
	});

	it('should produce different hashes for different inputs', () => {
		const hash1 = hashString('input a');
		const hash2 = hashString('input b');
		expect(hash1).not.toBe(hash2);
	});

	it('should handle empty string', () => {
		const hash = hashString('');
		expect(hash).toMatch(/^[0-9a-f]{8}$/);
	});

	it('should handle unicode', () => {
		const hash = hashString('你好世界🌍');
		expect(hash).toMatch(/^[0-9a-f]{8}$/);
	});
});

describe('combined transformations', () => {
	it('should handle complex markdown document', () => {
		const content = `---
title: React Hooks Guide
author: Developer
date: 2024-01-15
tags: [react, hooks, frontend]
---

# Understanding React Hooks

React Hooks are a powerful feature introduced in React 16.8.

## useState Hook

The useState hook allows you to add state to functional components.

\`\`\`javascript
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
\`\`\`

Here's a diagram of the component lifecycle:

![Component Lifecycle](./lifecycle.png)

## useEffect Hook

The useEffect hook handles side effects.

\`\`\`javascript
useEffect(() => {
  document.title = \`Count: \${count}\`;
}, [count]);
\`\`\`

![useEffect Flow](./useeffect.png "Effect Flow Diagram")

## Summary

React Hooks simplify state management in functional components.`;

		const result = prepareTextForEmbedding(content);

		// Frontmatter removed
		expect(result).not.toContain('title: React Hooks Guide');
		expect(result).not.toContain('author: Developer');

		// Code blocks summarized
		expect(result).toContain('[code: javascript]');
		expect(result).not.toContain('useState(0)');
		expect(result).not.toContain('setCount');

		// Images replaced
		expect(result).toContain('[image: Component Lifecycle]');
		expect(result).toContain('[image: useEffect Flow]');
		expect(result).not.toContain('./lifecycle.png');

		// Content preserved
		expect(result).toContain('Understanding React Hooks');
		expect(result).toContain('useState Hook');
		expect(result).toContain('useEffect Hook');
		expect(result).toContain('Summary');
	});

	it('should preserve CJK content', () => {
		const content = `---
title: 日本語ドキュメント
---

# React フックの使い方

Reactフックは関数コンポーネントで状態管理を可能にします。

\`\`\`typescript
const [count, setCount] = useState(0);
\`\`\`

![スクリーンショット](./screenshot.png)

これは日本語のコンテンツです。`;

		const result = prepareTextForEmbedding(content);

		expect(result).not.toContain('title: 日本語ドキュメント');
		expect(result).toContain('React フックの使い方');
		expect(result).toContain('[code: typescript]');
		expect(result).toContain('[image: スクリーンショット]');
		expect(result).toContain('これは日本語のコンテンツです');
	});
});
