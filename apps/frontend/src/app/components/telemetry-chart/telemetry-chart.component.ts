import {
  Component,
  ElementRef,
  type OnDestroy,
  type OnInit,
  effect,
  inject,
  computed,
  input,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, type ChartConfiguration, registerables } from 'chart.js';
import { SocketService } from '../../services/socket.service';

Chart.register(...registerables);

@Component({
  selector: 'app-telemetry-chart',
  imports: [CommonModule],
  template: `
    <div
      class="flex items-center gap-4 md:gap-6 w-full"
      [class.flex-col]="!mini()"
      [class.md:flex-row]="!mini()"
    >
      <div class="relative flex-1" [style.height.px]="mini() ? 40 : 200">
        <canvas #chartCanvas></canvas>
      </div>

      <!-- Real-time throughput readout -->
      <div
        class="shrink-0 flex flex-col items-center gap-0.5"
        [class.md:items-end]="!mini()"
        [class.px-4]="mini()"
        [class.md:px-8]="!mini()"
        [class.md:border-l]="!mini()"
        class="border-brand-border/30"
      >
        <div class="flex items-center gap-1.5">
          <div
            class="w-1.5 h-1.5 rounded-full bg-brand-accent transition-opacity duration-300"
            [class.shadow-[0_0_8px_rgba(0,243,255,0.8)]]="currentThroughput() > 0"
            [class.animate-pulse]="currentThroughput() > 0"
            [class.opacity-20]="currentThroughput() === 0"
            [class.bg-brand-text-muted]="currentThroughput() === 0"
          ></div>
          <span
            class="font-black uppercase tracking-[0.2em] text-brand-text-muted"
            [style.font-size.px]="mini() ? 7 : 10"
            >Live Rate</span
          >
        </div>
        <div class="flex items-baseline" [class.gap-2]="!mini()" [class.gap-1]="mini()">
          <span
            class="font-black tracking-tighter text-brand-accent tabular-nums leading-none"
            [class.text-xl]="mini()"
            [class.md:text-2xl]="mini()"
            [class.text-4xl]="!mini()"
            [class.md:text-6xl]="!mini()"
          >
            {{ currentThroughput() | number: '1.0-0' }}
          </span>
          <span class="font-bold text-brand-text-muted" [style.font-size.px]="mini() ? 8 : 12"
            >msg/s</span
          >
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
    `,
  ],
})
export class TelemetryChartComponent implements OnInit, OnDestroy {
  private static readonly WINDOW_SIZE = 60;
  private static readonly GRADIENT_START = 'rgba(0, 243, 255, 0.2)';
  private static readonly GRADIENT_END = 'rgba(0, 243, 255, 0)';
  private static readonly CHART_COLOR = '#00f3ff';

  protected readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');
  public readonly mini = input<boolean>(false);

  private readonly socketService = inject(SocketService);
  private chart: Chart | null = null;

  public readonly currentThroughput = computed(() => this.socketService.status()?.throughput || 0);

  constructor() {
    this.initializeTelemetryEffect();
  }

  public ngOnInit(): void {
    // Canvas might not be available yet if we use viewChild in ngOnInit
    // But since it's required and we're in standalone, it should be fine if we wait for afterViewInit
    // or just use it in an effect. Actually, let's use afterViewInit pattern or wait.
    setTimeout(() => this.initChart(), 0);
  }

  public ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  private initializeTelemetryEffect(): void {
    effect(() => {
      const history = this.socketService.telemetryHistory();
      this.updateChart(history);
    });
  }

  private initChart(): void {
    const canvasEl = this.canvas().nativeElement;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      return;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, TelemetryChartComponent.GRADIENT_START);
    gradient.addColorStop(1, TelemetryChartComponent.GRADIENT_END);

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: Array.from({ length: TelemetryChartComponent.WINDOW_SIZE }, (_, i) => i),
        datasets: [
          {
            label: 'Throughput (msg/s)',
            data: [],
            borderColor: TelemetryChartComponent.CHART_COLOR,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: TelemetryChartComponent.CHART_COLOR,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.4,
            fill: true,
            backgroundColor: gradient,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 300,
        },
        scales: {
          x: {
            display: false,
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.4)',
              font: {
                family: 'monospace',
                size: 10,
              },
              maxTicksLimit: 5,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(10, 11, 14, 0.9)',
            titleColor: TelemetryChartComponent.CHART_COLOR,
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              title: (tooltipItems) => `${tooltipItems[0]?.label ?? ''}s`,
              label: (context) => ` Throughput: ${context.parsed.y} msg/s`,
            },
          },
        },
      },
    };

    this.chart = new Chart(ctx, config);
  }

  private updateChart(history: { throughput: number; timestamp: number }[]): void {
    if (!this.chart) {
      return;
    }

    const throughputs: number[] = [];
    for (const entry of history) {
      throughputs.push(entry.throughput);
    }

    const size = TelemetryChartComponent.WINDOW_SIZE;
    const recent = throughputs.slice(-size);
    const paddingCount = Math.max(0, size - recent.length);

    const data = [];
    for (let i = 0; i < paddingCount; i++) {
      data.push(0);
    }
    for (const val of recent) {
      data.push(val);
    }

    const dataset = this.chart.data.datasets[0];
    if (dataset) {
      dataset.data = data;
      this.chart.update('none');
    }
  }
}
