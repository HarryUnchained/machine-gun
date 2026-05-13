import { TestBed } from '@angular/core/testing';
import { StorageService } from '../storage.service';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StorageService);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set and get a string item', () => {
    service.set('test-key', 'test-value');
    expect(service.get<string>('test-key')).toBe('test-value');
  });

  it('should set and get a complex object', () => {
    const obj = { foo: 'bar', baz: 123 };
    service.set('test-obj', obj);
    expect(service.get<typeof obj>('test-obj')).toEqual(obj);
  });

  it('should return null for non-existent key', () => {
    expect(service.get('ghost')).toBeNull();
  });

  it('should remove an item', () => {
    service.set('delete-me', true);
    service.remove('delete-me');
    expect(service.get('delete-me')).toBeNull();
  });

  it('should clear all items', () => {
    service.set('a', 1);
    service.set('b', 2);
    service.clear();
    expect(service.get('a')).toBeNull();
    expect(service.get('b')).toBeNull();
  });
});
