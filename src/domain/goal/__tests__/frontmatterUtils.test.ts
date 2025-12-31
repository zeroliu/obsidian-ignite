import { describe, expect, it } from 'vitest';
import { parseFrontmatter, serializeFrontmatter } from '../frontmatterUtils';

describe('frontmatterUtils', () => {
  describe('parseFrontmatter', () => {
    it('should parse basic frontmatter with string values', () => {
      const content = `---
name: Test Goal
description: A test description
---

Body content here`;

      const result = parseFrontmatter<{ name: string; description: string }>(content);

      expect(result.frontmatter.name).toBe('Test Goal');
      expect(result.frontmatter.description).toBe('A test description');
      expect(result.body).toBe('Body content here');
    });

    it('should parse frontmatter with numbers', () => {
      const content = `---
count: 42
rating: 4.5
negative: -10
---

Body`;

      const result = parseFrontmatter<{ count: number; rating: number; negative: number }>(
        content,
      );

      expect(result.frontmatter.count).toBe(42);
      expect(result.frontmatter.rating).toBe(4.5);
      expect(result.frontmatter.negative).toBe(-10);
    });

    it('should parse frontmatter with booleans', () => {
      const content = `---
active: true
archived: false
---

Body`;

      const result = parseFrontmatter<{ active: boolean; archived: boolean }>(content);

      expect(result.frontmatter.active).toBe(true);
      expect(result.frontmatter.archived).toBe(false);
    });

    it('should parse frontmatter with null values', () => {
      const content = `---
value1: null
value2:
---

Body`;

      const result = parseFrontmatter<{ value1: null; value2: null }>(content);

      expect(result.frontmatter.value1).toBeNull();
      expect(result.frontmatter.value2).toBeNull();
    });

    it('should parse frontmatter with quoted strings', () => {
      const content = `---
single: 'single quoted'
double: "double quoted"
---

Body`;

      const result = parseFrontmatter<{ single: string; double: string }>(content);

      expect(result.frontmatter.single).toBe('single quoted');
      expect(result.frontmatter.double).toBe('double quoted');
    });

    it('should parse frontmatter with simple arrays', () => {
      const content = `---
tags:
  - tag1
  - tag2
  - tag3
---

Body`;

      const result = parseFrontmatter<{ tags: string[] }>(content);

      expect(result.frontmatter.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse frontmatter with array of objects', () => {
      const content = `---
milestones:
  - id: m1
    title: First milestone
    completed: false
  - id: m2
    title: Second milestone
    completed: true
---

Body`;

      const result = parseFrontmatter<{
        milestones: Array<{ id: string; title: string; completed: boolean }>;
      }>(content);

      expect(result.frontmatter.milestones).toHaveLength(2);
      expect(result.frontmatter.milestones[0]).toEqual({
        id: 'm1',
        title: 'First milestone',
        completed: false,
      });
      expect(result.frontmatter.milestones[1]).toEqual({
        id: 'm2',
        title: 'Second milestone',
        completed: true,
      });
    });

    it('should parse complex nested structure', () => {
      const content = `---
id: goal-123
name: Learn TypeScript
status: active
createdAt: 2025-01-01T00:00:00Z
milestones:
  - id: m1
    title: Basics
    completed: true
  - id: m2
    title: Advanced
    completed: false
notesPaths:
  - notes/typescript.md
  - notes/types.md
---

# Goal Content

This is the body.`;

      interface Goal {
        id: string;
        name: string;
        status: string;
        createdAt: string;
        milestones: Array<{ id: string; title: string; completed: boolean }>;
        notesPaths: string[];
      }

      const result = parseFrontmatter<Goal>(content);

      expect(result.frontmatter.id).toBe('goal-123');
      expect(result.frontmatter.name).toBe('Learn TypeScript');
      expect(result.frontmatter.status).toBe('active');
      expect(result.frontmatter.milestones).toHaveLength(2);
      expect(result.frontmatter.notesPaths).toEqual(['notes/typescript.md', 'notes/types.md']);
      expect(result.body).toContain('# Goal Content');
    });

    it('should throw error if no frontmatter found', () => {
      const content = 'Just body content, no frontmatter';

      expect(() => parseFrontmatter(content)).toThrow('No frontmatter found in content');
    });

    it('should handle empty body', () => {
      const content = `---
name: Test
---
`;

      const result = parseFrontmatter<{ name: string }>(content);

      expect(result.frontmatter.name).toBe('Test');
      expect(result.body).toBe('');
    });
  });

  describe('serializeFrontmatter', () => {
    it('should serialize basic object with strings', () => {
      const frontmatter = {
        name: 'Test Goal',
        description: 'A test description',
      };
      const body = 'Body content';

      const result = serializeFrontmatter(frontmatter, body);

      expect(result).toContain('---');
      expect(result).toContain('name: Test Goal');
      expect(result).toContain('description: A test description');
      expect(result).toContain('Body content');
    });

    it('should serialize numbers', () => {
      const frontmatter = {
        count: 42,
        rating: 4.5,
      };
      const body = '';

      const result = serializeFrontmatter(frontmatter, body);

      expect(result).toContain('count: 42');
      expect(result).toContain('rating: 4.5');
    });

    it('should serialize booleans', () => {
      const frontmatter = {
        active: true,
        archived: false,
      };
      const body = '';

      const result = serializeFrontmatter(frontmatter, body);

      expect(result).toContain('active: true');
      expect(result).toContain('archived: false');
    });

    it('should serialize null and undefined as empty string', () => {
      const frontmatter = {
        value1: null,
        value2: undefined,
      };
      const body = '';

      const result = serializeFrontmatter(frontmatter, body);

      expect(result).toContain('value1:');
      expect(result).toContain('value2:');
      expect(result).not.toContain('value1: null');
      expect(result).not.toContain('value2: undefined');
    });

    it('should serialize simple arrays', () => {
      const frontmatter = {
        tags: ['tag1', 'tag2', 'tag3'],
      };
      const body = '';

      const result = serializeFrontmatter(frontmatter, body);

      expect(result).toContain('tags:');
      expect(result).toContain('  - tag1');
      expect(result).toContain('  - tag2');
      expect(result).toContain('  - tag3');
    });

    it('should serialize array of objects', () => {
      const frontmatter = {
        milestones: [
          { id: 'm1', title: 'First', completed: false },
          { id: 'm2', title: 'Second', completed: true },
        ],
      };
      const body = '';

      const result = serializeFrontmatter(frontmatter, body);

      expect(result).toContain('milestones:');
      expect(result).toContain('  - id: m1');
      expect(result).toContain('    title: First');
      expect(result).toContain('    completed: false');
      expect(result).toContain('  - id: m2');
      expect(result).toContain('    title: Second');
      expect(result).toContain('    completed: true');
    });

    it('should quote strings with special YAML characters', () => {
      const frontmatter = {
        special: 'value: with colon',
        multiline: 'line1\nline2',
      };
      const body = '';

      const result = serializeFrontmatter(frontmatter, body);

      expect(result).toContain('"value: with colon"');
      expect(result).toContain('"line1\\nline2"');
    });

    it('should round-trip parse and serialize', () => {
      const original = {
        id: 'goal-123',
        name: 'Learn TypeScript',
        status: 'active',
        count: 42,
        active: true,
        tags: ['typescript', 'learning'],
        milestones: [
          { id: 'm1', title: 'Basics', completed: true },
          { id: 'm2', title: 'Advanced', completed: false },
        ],
      };
      const body = '# Goal Content\n\nThis is the body.';

      // Serialize
      const serialized = serializeFrontmatter(original, body);

      // Parse back
      const parsed = parseFrontmatter<typeof original>(serialized);

      // Verify round-trip
      expect(parsed.frontmatter.id).toBe(original.id);
      expect(parsed.frontmatter.name).toBe(original.name);
      expect(parsed.frontmatter.status).toBe(original.status);
      expect(parsed.frontmatter.count).toBe(original.count);
      expect(parsed.frontmatter.active).toBe(original.active);
      expect(parsed.frontmatter.tags).toEqual(original.tags);
      expect(parsed.frontmatter.milestones).toEqual(original.milestones);
      expect(parsed.body).toBe(body);
    });
  });
});
