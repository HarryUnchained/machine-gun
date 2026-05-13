import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';
import { IconComponent, type IconName } from '../icon/icon.component';

@Component({
  selector: 'app-notification',
  imports: [CommonModule, IconComponent],
  template: `
    <div class="fixed bottom-8 left-8 z-[9999] flex flex-col gap-3 pointer-events-none">
      @for (n of service.activeNotifications(); track n.id) {
        <div
          class="pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in slide-in-from-left-8 duration-300 min-w-[320px] max-w-md"
          [class]="getClasses(n.type)"
        >
          <div
            class="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border"
            [class]="getIconBgClasses(n.type)"
          >
            <app-icon [name]="getIcon(n.type)" [size]="20"></app-icon>
          </div>

          <div class="flex-1">
            <p class="text-sm font-bold text-brand-text tracking-tight leading-tight">
              {{ n.message }}
            </p>
          </div>

          <button
            (click)="service.remove(n.id)"
            class="p-1.5 hover:bg-brand-text/10 rounded-lg transition-colors text-brand-text/40 hover:text-brand-text"
          >
            <app-icon name="close" [size]="16"></app-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
})
export class NotificationComponent {
  protected readonly service = inject(NotificationService);

  protected getClasses(type: string): string {
    switch (type) {
      case 'warning':
        return 'bg-brand-warning/10 border-brand-warning/30 text-brand-warning';
      case 'error':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'success':
        return 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary';
      default:
        return 'bg-brand-surface/80 border-brand-border text-brand-text';
    }
  }

  protected getIconBgClasses(type: string): string {
    switch (type) {
      case 'warning':
        return 'bg-brand-warning/10 border-brand-warning/20 text-brand-warning';
      case 'error':
        return 'bg-red-500/10 border-red-500/20 text-red-400';
      case 'success':
        return 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary';
      default:
        return 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary';
    }
  }

  protected getIcon(type: string): IconName {
    switch (type) {
      case 'warning':
        return 'bolt';
      case 'error':
        return 'delete';
      case 'success':
        return 'play';
      default:
        return 'timer';
    }
  }
}
