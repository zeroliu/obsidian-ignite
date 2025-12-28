import { InMemoryStorageAdapter } from '@/adapters/mock/InMemoryStorageAdapter';
import { beforeEach, describe, expect, it } from 'vitest';

describe('InMemoryStorageAdapter', () => {
  let adapter: InMemoryStorageAdapter;

  beforeEach(() => {
    adapter = new InMemoryStorageAdapter();
  });

  describe('read/write', () => {
    it('should write and read string data', async () => {
      await adapter.write('key', 'value');
      const result = await adapter.read<string>('key');
      expect(result).toBe('value');
    });

    it('should write and read object data', async () => {
      const data = { name: 'test', count: 42 };
      await adapter.write('obj', data);
      const result = await adapter.read<typeof data>('obj');
      expect(result).toEqual(data);
    });

    it('should write and read array data', async () => {
      const data = [1, 2, 3, 4, 5];
      await adapter.write('arr', data);
      const result = await adapter.read<number[]>('arr');
      expect(result).toEqual(data);
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.read('non-existent');
      expect(result).toBeNull();
    });

    it('should overwrite existing data', async () => {
      await adapter.write('key', 'first');
      await adapter.write('key', 'second');
      const result = await adapter.read<string>('key');
      expect(result).toBe('second');
    });
  });

  describe('exists', () => {
    it('should return true for existing key', async () => {
      await adapter.write('key', 'value');
      const exists = await adapter.exists('key');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await adapter.exists('non-existent');
      expect(exists).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      await adapter.write('key', 'value');
      await adapter.delete('key');
      const exists = await adapter.exists('key');
      expect(exists).toBe(false);
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(adapter.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('keys', () => {
    it('should return all keys', async () => {
      await adapter.write('a', 1);
      await adapter.write('b', 2);
      await adapter.write('c', 3);
      const keys = await adapter.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should return empty array when storage is empty', async () => {
      const keys = await adapter.keys();
      expect(keys).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should remove all data', async () => {
      await adapter.write('a', 1);
      await adapter.write('b', 2);
      await adapter.clear();
      const keys = await adapter.keys();
      expect(keys).toHaveLength(0);
    });
  });

  describe('_getStorage/_setStorage', () => {
    it('should get raw storage', async () => {
      await adapter.write('key', 'value');
      const storage = adapter._getStorage();
      expect(storage.get('key')).toBe('value');
    });

    it('should set storage directly', async () => {
      adapter._setStorage({ a: 1, b: 2 });
      const a = await adapter.read<number>('a');
      const b = await adapter.read<number>('b');
      expect(a).toBe(1);
      expect(b).toBe(2);
    });
  });
});
