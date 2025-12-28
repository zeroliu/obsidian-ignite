import { describe, expect, it } from 'vitest';
import { filterEmptyTexts } from '../filterEmptyTexts';

describe('filterEmptyTexts', () => {
	it('should return all texts when none are empty', () => {
		const inputs = [
			{ notePath: 'note1.md', text: 'Content one' },
			{ notePath: 'note2.md', text: 'Content two' },
		];

		const result = filterEmptyTexts(inputs);

		expect(result.nonEmptyTexts).toHaveLength(2);
		expect(result.excludedNotePaths).toHaveLength(0);
	});

	it('should exclude empty strings', () => {
		const inputs = [
			{ notePath: 'note1.md', text: '' },
			{ notePath: 'note2.md', text: 'Content' },
		];

		const result = filterEmptyTexts(inputs);

		expect(result.nonEmptyTexts).toHaveLength(1);
		expect(result.nonEmptyTexts[0].notePath).toBe('note2.md');
		expect(result.excludedNotePaths).toEqual(['note1.md']);
	});

	it('should exclude whitespace-only strings', () => {
		const inputs = [
			{ notePath: 'note1.md', text: '   ' },
			{ notePath: 'note2.md', text: '\t\n' },
			{ notePath: 'note3.md', text: 'Content' },
		];

		const result = filterEmptyTexts(inputs);

		expect(result.nonEmptyTexts).toHaveLength(1);
		expect(result.nonEmptyTexts[0].notePath).toBe('note3.md');
		expect(result.excludedNotePaths).toEqual(['note1.md', 'note2.md']);
	});

	it('should handle all empty texts', () => {
		const inputs = [
			{ notePath: 'note1.md', text: '' },
			{ notePath: 'note2.md', text: '  ' },
		];

		const result = filterEmptyTexts(inputs);

		expect(result.nonEmptyTexts).toHaveLength(0);
		expect(result.excludedNotePaths).toEqual(['note1.md', 'note2.md']);
	});

	it('should handle empty input array', () => {
		const result = filterEmptyTexts([]);

		expect(result.nonEmptyTexts).toHaveLength(0);
		expect(result.excludedNotePaths).toHaveLength(0);
	});

	it('should preserve order of non-empty texts', () => {
		const inputs = [
			{ notePath: 'a.md', text: 'A' },
			{ notePath: 'b.md', text: '' },
			{ notePath: 'c.md', text: 'C' },
			{ notePath: 'd.md', text: '' },
			{ notePath: 'e.md', text: 'E' },
		];

		const result = filterEmptyTexts(inputs);

		expect(result.nonEmptyTexts.map((t) => t.notePath)).toEqual(['a.md', 'c.md', 'e.md']);
		expect(result.excludedNotePaths).toEqual(['b.md', 'd.md']);
	});

	it('should not trim actual content', () => {
		const inputs = [{ notePath: 'note.md', text: '  spaced content  ' }];

		const result = filterEmptyTexts(inputs);

		expect(result.nonEmptyTexts).toHaveLength(1);
		expect(result.nonEmptyTexts[0].text).toBe('  spaced content  ');
	});
});
