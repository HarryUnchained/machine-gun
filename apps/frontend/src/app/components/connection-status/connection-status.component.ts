import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { SocketService } from '../../services/socket.service';
import { NavigationService, type ViewMode } from '../../services/navigation.service';

import { IconComponent } from '../icon/icon.component';
import { FlowService } from '../../services/flow.service';

@Component({
  selector: 'app-connection-status',
  imports: [IconComponent],
  templateUrl: './connection-status.component.html',
  styleUrls: ['./connection-status.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class ConnectionStatusComponent {
  private readonly socketService = inject(SocketService);
  private readonly navService = inject(NavigationService);
  private readonly flowService = inject(FlowService);

  protected readonly viewMode = this.navService.viewMode;
  protected readonly connected = this.socketService.connected;
  protected readonly rabbitConnected = this.socketService.rabbitConnected;
  protected readonly rabbitConnecting = this.socketService.rabbitConnecting;
  protected readonly rabbitAvailable = this.socketService.rabbitAvailable;
  protected readonly kafkaConnected = this.socketService.kafkaConnected;
  protected readonly kafkaConnecting = this.socketService.kafkaConnecting;
  protected readonly kafkaAvailable = this.socketService.kafkaAvailable;
  protected readonly socketConnecting = this.socketService.socketConnecting;
  protected readonly schemas = this.socketService.schemas;
  protected readonly flows = this.flowService.availableFlows;

  public setViewMode(mode: ViewMode): void {
    this.navService.setViewMode(mode);
  }
}
