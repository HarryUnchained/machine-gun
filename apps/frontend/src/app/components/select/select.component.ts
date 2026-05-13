import {
  Component,
  input,
  output,
  signal,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent, type IconName } from '../icon/icon.component';

export interface SelectOption<T = unknown> {
  value: T;
  label: string;
  icon?: IconName;
}

@Component({
  selector: 'app-select',
  imports: [CommonModule, IconComponent],
  template: `
    <div class="relative w-full">
      <!-- Select Button -->
      <button
        type="button"
        (click)="toggle()"
        class="w-full flex items-center justify-between gap-3 px-4 py-3 bg-brand-overlay border border-brand-border rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/40 transition-all hover:bg-brand-overlay/80 group"
        [class.ring-2]="isOpen()"
        [class.ring-brand-primary/40]="isOpen()"
      >
        <div class="flex items-center gap-2.5 truncate">
          @if (selectedOption()?.icon) {
            <app-icon
              [name]="selectedOption()!.icon!"
              [size]="16"
              class="text-brand-primary/70"
            ></app-icon>
          }
          <span class="text-sm font-medium truncate">
            {{ selectedOption()?.label || placeholder() }}
          </span>
        </div>
        <app-icon
          name="add"
          [size]="16"
          class="text-brand-text-muted transition-transform duration-300"
          [class.rotate-45]="isOpen()"
        ></app-icon>
      </button>

      <!-- Dropdown List -->
      @if (isOpen()) {
        <div
          class="absolute z-[60] left-0 right-0 p-1.5 bg-brand-surface/95 backdrop-blur-2xl border border-brand-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
          [class.top-full]="panelDirection() === 'down'"
          [class.mt-2]="panelDirection() === 'down'"
          [class.origin-top]="panelDirection() === 'down'"
          [class.bottom-full]="panelDirection() === 'up'"
          [class.mb-2]="panelDirection() === 'up'"
          [class.origin-bottom]="panelDirection() === 'up'"
        >
          <div class="max-h-60 overflow-y-auto brand-scrollbar">
            @for (option of options(); track option.value) {
              <button
                type="button"
                (click)="select(option)"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-primary/10 transition-all text-left group"
                [class.bg-brand-primary/10]="option.value === value()"
              >
                <div class="flex-1 flex items-center gap-2.5 min-w-0">
                  @if (option.icon) {
                    <app-icon
                      [name]="option.icon"
                      [size]="14"
                      [class]="
                        option.value === value() ? 'text-brand-primary' : 'text-brand-text-muted/60'
                      "
                    ></app-icon>
                  }
                  <span
                    class="text-sm font-bold truncate"
                    [class.text-brand-primary]="option.value === value()"
                    [class.text-brand-text]="option.value !== value()"
                  >
                    {{ option.label }}
                  </span>
                </div>
                @if (option.value === value()) {
                  <div class="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse"></div>
                }
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'onEscape()',
  },
})
export class SelectComponent<T = unknown> {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  public readonly options = input.required<SelectOption<T>[]>();
  public readonly value = input<T | undefined>();
  public readonly placeholder = input<string>('Select an option');
  public readonly panelDirection = input<'down' | 'up'>('down');

  public readonly change = output<T>();

  public readonly isOpen = signal(false);

  protected readonly selectedOption = computed(() => {
    const val = this.value();
    for (const option of this.options()) {
      if (option.value === val) {
        return option;
      }
    }
    return undefined;
  });

  public toggle(): void {
    this.isOpen.update((v) => !v);
  }

  public select(option: SelectOption<T>): void {
    this.change.emit(option.value);
    this.isOpen.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (!(this.elementRef.nativeElement as HTMLElement).contains(target)) {
      this.isOpen.set(false);
    }
  }

  protected onEscape(): void {
    this.isOpen.set(false);
  }
}
