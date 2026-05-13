import { Component, effect, inject } from '@angular/core';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { NotificationComponent } from './components/notification/notification.component';
import { NotificationService } from './services/notification.service';
import { SocketService } from './services/socket.service';

@Component({
  selector: 'app-root',
  imports: [DashboardComponent, NotificationComponent],
  template: `
    <app-dashboard></app-dashboard>
    <app-notification></app-notification>
  `,
})
export class App {
  private readonly notificationService = inject(NotificationService);
  private readonly socketService = inject(SocketService);
  private lastBrokerNotificationId: string | null = null;

  constructor() {
    effect(() => {
      const notification = this.socketService.brokerTargetNotification();
      if (!notification || notification.id === this.lastBrokerNotificationId) {
        return;
      }

      this.lastBrokerNotificationId = notification.id;

      const targetLabel = notification.targetType === 'exchange' ? 'Exchange' : 'Queue';
      const exchangeHint =
        notification.targetType === 'exchange' && notification.exchangeType
          ? ` (exchange type: ${notification.exchangeType})`
          : '';

      this.notificationService.show(
        `${targetLabel} "${notification.target}" was missing and has been created automatically${exchangeHint}.`,
        'warning',
        6000,
      );
    });
  }
}
