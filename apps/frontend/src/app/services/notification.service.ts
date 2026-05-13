import { Injectable, signal } from '@angular/core';

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private static readonly DEFAULT_DURATION = 5000;

  private readonly notifications = signal<Notification[]>([]);
  public readonly activeNotifications = this.notifications.asReadonly();

  public show(
    message: string,
    type: Notification['type'] = 'info',
    duration = NotificationService.DEFAULT_DURATION,
  ) {
    const id = Math.random().toString(36).substring(2, 9);
    const notification: Notification = { id, message, type, duration };

    this.notifications.update((prev) => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
  }

  public remove(id: string): void {
    this.notifications.update((prev) => {
      const next: Notification[] = [];
      for (const n of prev) {
        if (n.id !== id) {
          next.push(n);
        }
      }
      return next;
    });
  }
}
