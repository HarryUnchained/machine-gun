import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../theme.service';
import { PLATFORM_ID } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    service = TestBed.inject(ThemeService);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    // Clean up class list
    document.documentElement.className = '';
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set theme and update class list', () => {
    service.setTheme('theme-mat-purple');
    TestBed.flushEffects();
    expect(service.currentTheme()).toBe('theme-mat-purple');
    expect(document.documentElement.classList.contains('theme-mat-purple')).toBe(true);
  });

  it('should handle switching between themes', () => {
    service.setTheme('theme-nord');
    TestBed.flushEffects();
    expect(document.documentElement.classList.contains('theme-nord')).toBe(true);

    service.setTheme('theme-serika');
    TestBed.flushEffects();
    expect(document.documentElement.classList.contains('theme-nord')).toBe(false);
    expect(document.documentElement.classList.contains('theme-serika')).toBe(true);
  });

  it('should revert to default for theme-indigo', () => {
    service.setTheme('theme-mat-purple');
    TestBed.flushEffects();
    service.setTheme('theme-indigo');
    TestBed.flushEffects();
    expect(document.documentElement.classList.contains('theme-mat-purple')).toBe(false);
    expect(document.documentElement.classList.contains('theme-indigo')).toBe(false);
  });
});
