import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, type AppTheme } from '../../services/theme.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-theme-switcher',
  imports: [CommonModule, IconComponent],
  template: `
    <div class="relative">
      <button
        (click)="isOpen.set(!isOpen())"
        class="p-2.5 hover:bg-brand-overlay rounded-xl transition-all text-brand-text-muted hover:text-brand-text flex items-center justify-center border border-transparent hover:border-brand-border group"
        [title]="'Change Theme'"
      >
        <app-icon
          name="palette"
          [size]="20"
          [class.text-brand-primary]="isOpen()"
          class="transition-transform group-hover:scale-110"
        ></app-icon>
      </button>

      @if (isOpen()) {
        <div
          class="absolute right-0 mt-2 w-56 bg-brand-surface/95 backdrop-blur-2xl border border-brand-border rounded-2xl shadow-2xl p-2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div class="px-3 py-2 mb-1">
            <span
              class="text-[10px] font-black uppercase tracking-[0.2em] text-brand-text-muted opacity-50"
              >Interface Theme</span
            >
          </div>

          <div class="space-y-0.5">
            @for (theme of themes; track theme.id) {
              <button
                (click)="selectTheme(theme.id)"
                class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all hover:bg-brand-overlay group text-left"
                [class.bg-brand-primary/10]="themeService.currentTheme() === theme.id"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-4 h-4 rounded-full border border-brand-border/20 flex items-center justify-center overflow-hidden"
                    [style.background]="theme.surface"
                  >
                    <div
                      class="w-1.5 h-1.5 rounded-full"
                      [style.backgroundColor]="theme.primary"
                    ></div>
                  </div>

                  <span
                    class="text-xs font-bold transition-colors"
                    [class.text-brand-primary]="themeService.currentTheme() === theme.id"
                    [class.text-brand-text]="themeService.currentTheme() !== theme.id"
                  >
                    {{ theme.label }}
                  </span>
                </div>

                @if (themeService.currentTheme() === theme.id) {
                  <app-icon name="check" [size]="14" class="text-brand-primary"></app-icon>
                }
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ThemeSwitcherComponent {
  private static readonly AVAILABLE_THEMES: {
    id: AppTheme;
    primary: string;
    surface: string;
    label: string;
  }[] = [
    { id: 'theme-indigo', primary: '#6366f1', surface: '#09090b', label: 'Royal Indigo' },
    { id: 'theme-nord', primary: '#38bdf8', surface: '#020617', label: 'Oceanic Slate' },
    { id: 'theme-serika', primary: '#f59e0b', surface: '#0c0a09', label: 'Sandstone Stone' },
    { id: 'theme-light', primary: '#4f46e5', surface: '#ffffff', label: 'Snow Light' },
    { id: 'theme-mono-light', primary: '#000000', surface: '#ffffff', label: 'Mono Light' },
    { id: 'theme-mat-indigo', primary: '#3f51b5', surface: '#fafafa', label: 'Material Indigo' },
    { id: 'theme-mat-purple', primary: '#673ab7', surface: '#fafafa', label: 'Material Purple' },
  ];

  protected readonly themeService = inject(ThemeService);
  protected readonly isOpen = signal(false);
  protected readonly themes = ThemeSwitcherComponent.AVAILABLE_THEMES;

  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('app-theme-switcher')) {
      this.isOpen.set(false);
    }
  }

  protected selectTheme(themeId: AppTheme): void {
    this.themeService.setTheme(themeId);
    this.isOpen.set(false);
  }
}
