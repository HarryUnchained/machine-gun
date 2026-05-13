import { TestBed } from '@angular/core/testing';
import { NavigationService } from '../navigation.service';
import { StorageService } from '../storage.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('NavigationService', () => {
  let service: NavigationService;
  let mockStorageService: any;

  beforeEach(() => {
    mockStorageService = {
      get: vi.fn(),
      set: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [NavigationService, { provide: StorageService, useValue: mockStorageService }],
    });
  });

  it('should be created', () => {
    mockStorageService.get.mockReturnValue(true);
    service = TestBed.inject(NavigationService);
    expect(service).toBeTruthy();
  });

  it('should initialize showLibrary from storage', () => {
    mockStorageService.get.mockReturnValue(false);
    service = TestBed.inject(NavigationService);
    expect(service.showLibrary()).toBe(false);
    expect(mockStorageService.get).toHaveBeenCalledWith('showLibrary');
  });

  it('should change view mode', () => {
    mockStorageService.get.mockReturnValue(true);
    service = TestBed.inject(NavigationService);
    service.setViewMode('flows');
    expect(service.viewMode()).toBe('flows');
  });

  it('should toggle library visibility', () => {
    mockStorageService.get.mockReturnValue(true);
    service = TestBed.inject(NavigationService);
    service.showLibrary.set(false);
    expect(service.showLibrary()).toBe(false);
  });
});
