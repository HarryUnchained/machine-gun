import { Injectable, signal, inject, effect } from '@angular/core';
import { StorageService } from './storage.service';

export type ViewMode = 'schemas' | 'flows';

@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  private static readonly BREAKPOINT_LG = 1024;

  private readonly storageService = inject(StorageService);

  public readonly viewMode = signal<ViewMode>('schemas');
  public readonly showLibrary = signal(
    this.storageService.get<boolean>('showLibrary') ??
      window.innerWidth > NavigationService.BREAKPOINT_LG,
  );

  constructor() {
    this.initializePersistenceEffect();
  }

  private initializePersistenceEffect(): void {
    effect(() => {
      this.storageService.set('showLibrary', this.showLibrary());
    });
  }

  public setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }
}
