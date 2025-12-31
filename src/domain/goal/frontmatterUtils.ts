/**
 * Utilities for parsing and serializing markdown files with YAML frontmatter.
 */

/**
 * Result of parsing a markdown file with frontmatter.
 */
export interface FrontmatterParseResult<T> {
  frontmatter: T;
  body: string;
}

/**
 * Parse a markdown file with YAML frontmatter.
 * @param content - The markdown file content
 * @returns Parsed frontmatter and body
 */
export function parseFrontmatter<T>(content: string): FrontmatterParseResult<T> {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('No frontmatter found in content');
  }

  const yamlContent = match[1];
  const body = match[2];

  // Parse YAML manually (simple implementation)
  const frontmatter = parseYaml<T>(yamlContent);

  return { frontmatter, body };
}

/**
 * Serialize frontmatter and body into a markdown file.
 * @param frontmatter - The frontmatter object
 * @param body - The markdown body
 * @returns Complete markdown file content
 */
export function serializeFrontmatter<T>(frontmatter: T, body: string): string {
  const yamlContent = serializeYaml(frontmatter);
  return `---\n${yamlContent}\n---\n\n${body}`;
}

/**
 * Simple YAML parser for frontmatter.
 * Handles basic types: strings, numbers, booleans, arrays, objects.
 */
function parseYaml<T>(yaml: string): T {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  let currentObject: Record<string, unknown> | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      const [, spaces, key, value] = keyMatch;
      const lineIndent = spaces.length;

      // If we were building an array or object, save it
      if (currentArray && currentKey) {
        result[currentKey] = currentArray;
        currentArray = null;
        currentKey = null;
      }
      if (currentObject && currentKey) {
        result[currentKey] = currentObject;
        currentObject = null;
        currentKey = null;
      }

      if (lineIndent === 0) {
        // Top-level key
        if (value === '') {
          // Empty value means array or object follows
          currentKey = key;
        } else {
          result[key] = parseValue(value);
        }
      } else if (currentObject) {
        // Nested object property
        currentObject[key] = parseValue(value);
      }
      continue;
    }

    const arrayMatch = line.match(/^(\s*)- (.*)$/);
    if (arrayMatch) {
      const [, , value] = arrayMatch;

      if (!currentArray && currentKey) {
        currentArray = [];
      }

      if (currentArray) {
        // Check if this is an object array item
        const objectKeyMatch = value.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (objectKeyMatch) {
          const [, key, val] = objectKeyMatch;
          currentObject = { [key]: parseValue(val) };
        } else {
          if (currentObject) {
            currentArray.push(currentObject);
            currentObject = null;
          }
          currentArray.push(parseValue(value));
        }
      }
      continue;
    }

    // Nested object property (inside array item)
    const nestedMatch = line.match(/^(\s+)([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (nestedMatch && currentObject) {
      const [, , key, value] = nestedMatch;
      currentObject[key] = parseValue(value);
    }
  }

  // Save any remaining array or object
  if (currentArray && currentKey) {
    result[currentKey] = currentArray;
  }
  if (currentObject && currentKey) {
    result[currentKey] = currentObject;
  }

  return result as T;
}

/**
 * Parse a YAML value to its appropriate type.
 */
function parseValue(value: string): unknown {
  const trimmed = value.trim();

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Null
  if (trimmed === 'null' || trimmed === '') return null;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  // String (remove quotes if present)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * Simple YAML serializer for frontmatter.
 * Handles basic types: strings, numbers, booleans, arrays, objects.
 */
function serializeYaml(obj: unknown, indent = 0): string {
  const lines: string[] = [];
  const spaces = ' '.repeat(indent);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        lines.push(`${spaces}- ${serializeYamlObject(item, indent + 2)}`);
      } else {
        lines.push(`${spaces}- ${serializeYamlValue(item)}`);
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        lines.push(`${spaces}${key}:`);
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            const firstEntry = Object.entries(item)[0];
            if (firstEntry) {
              lines.push(`${spaces}  - ${firstEntry[0]}: ${serializeYamlValue(firstEntry[1])}`);
              for (const [k, v] of Object.entries(item).slice(1)) {
                lines.push(`${spaces}    ${k}: ${serializeYamlValue(v)}`);
              }
            }
          } else {
            lines.push(`${spaces}  - ${serializeYamlValue(item)}`);
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`${spaces}${key}:`);
        lines.push(serializeYaml(value, indent + 2));
      } else {
        lines.push(`${spaces}${key}: ${serializeYamlValue(value)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Serialize a YAML object (for array items).
 */
function serializeYamlObject(obj: Record<string, unknown>, indent: number): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';

  const [firstKey, firstValue] = entries[0];
  const lines = [`${firstKey}: ${serializeYamlValue(firstValue)}`];

  for (const [key, value] of entries.slice(1)) {
    lines.push(`${' '.repeat(indent)}${key}: ${serializeYamlValue(value)}`);
  }

  return lines.join('\n');
}

/**
 * Serialize a YAML value to its string representation.
 */
function serializeYamlValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') {
    // Quote strings that contain special characters
    if (/[:#\[\]{}|>]/.test(value) || value.includes('\n')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}
