import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type AppTheme =
  | 'theme-indigo'
  | 'theme-nord'
  | 'theme-serika'
  | 'theme-light'
  | 'theme-mono-light'
  | 'theme-mat-indigo'
  | 'theme-mat-purple';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private static readonly AVAILABLE_THEMES: AppTheme[] = [
    'theme-indigo',
    'theme-nord',
    'theme-serika',
    'theme-light',
    'theme-mono-light',
    'theme-mat-indigo',
    'theme-mat-purple',
  ];
  private static readonly FAVICON_BY_THEME: Record<AppTheme, string> = {
    'theme-indigo': 'favicon-indigo.svg',
    'theme-nord': 'favicon-indigo.svg',
    'theme-serika': 'favicon-rose.svg',
    'theme-light': 'favicon-light.svg',
    'theme-mono-light': 'favicon-light.svg',
    'theme-mat-indigo': 'favicon-indigo.svg',
    'theme-mat-purple': 'favicon-purple.svg',
  };

  private readonly platformId = inject(PLATFORM_ID);

  public currentTheme = signal<AppTheme>('theme-indigo');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('mg-theme') as AppTheme;
      if (saved) {
        this.currentTheme.set(saved);
      }

      effect(() => {
        const theme = this.currentTheme();
        localStorage.setItem('mg-theme', theme);
        this.applyTheme(theme);
        this.updateFavicon(theme);
      });
    }
  }

  setTheme(theme: AppTheme) {
    this.currentTheme.set(theme);
  }

  private updateFavicon(theme: AppTheme) {
    if (!isPlatformBrowser(this.platformId)) return;

    const favicon = document.getElementById('favicon') as HTMLLinkElement;
    if (favicon) {
      favicon.href = ThemeService.FAVICON_BY_THEME[theme] ?? 'favicon.png';
      favicon.type = 'image/svg+xml';
    }
  }

  private applyTheme(theme: AppTheme) {
    if (!isPlatformBrowser(this.platformId)) return;

    const root = document.documentElement;
    for (const t of ThemeService.AVAILABLE_THEMES) {
      root.classList.remove(t);
    }
    if (theme !== 'theme-indigo') {
      root.classList.add(theme);
    }
  }
}
