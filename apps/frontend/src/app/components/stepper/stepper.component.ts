import { Component, input, model, ChangeDetectionStrategy } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { increment, decrement } from '@machine-gun/common';

@Component({
  selector: 'app-stepper',
  imports: [IconComponent],
  template: `
    <div
      class="flex items-center gap-1 bg-brand-surface/50 border border-brand-border/50 rounded-lg px-1 transition-all focus-within:border-brand-primary/50 group/stepper"
      [class]="containerClass()"
    >
      <button
        type="button"
        (click)="handleDecrement($event)"
        class="p-1.5 hover:text-brand-primary transition-colors text-brand-text-muted disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
        [disabled]="min() !== undefined && (value() ?? 0) <= min()!"
        title="Decrement"
      >
        <app-icon name="remove" [size]="iconSize()"></app-icon>
      </button>

      <input
        type="number"
        [value]="value() ?? ''"
        (input)="handleInput($event)"
        (mousedown)="$event.stopPropagation()"
        [step]="step()"
        [placeholder]="placeholder()"
        class="bg-transparent border-none text-brand-text text-center outline-none focus:ring-0 font-mono p-0"
        [class]="inputClass()"
      />

      <button
        type="button"
        (click)="handleIncrement($event)"
        class="p-1.5 hover:text-brand-primary transition-colors text-brand-text-muted shrink-0"
        title="Increment"
      >
        <app-icon name="add" [size]="iconSize()"></app-icon>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
      /* Hide spin buttons even if global CSS isn't loaded */
      input::-webkit-outer-spin-button,
      input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      input[type='number'] {
        -moz-appearance: textfield;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepperComponent {
  public readonly value = model<number | null>(null);
  public readonly step = input<number>(1);
  public readonly min = input<number | undefined>(undefined);
  public readonly placeholder = input<string>('');
  public readonly iconSize = input<number>(10);
  public readonly containerClass = input<string>('');
  public readonly inputClass = input<string>('w-12 text-xs');

  protected handleIncrement(event: MouseEvent): void {
    event.stopPropagation();
    const current = this.value() ?? 0;
    this.value.set(increment(current, this.step()));
  }

  protected handleDecrement(event: MouseEvent): void {
    event.stopPropagation();
    const current = this.value() ?? 0;
    this.value.set(decrement(current, this.step(), this.min()));
  }

  protected handleInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (val === '') {
      this.value.set(null);
      return;
    }

    const num = Number(val);
    if (!isNaN(num)) {
      this.value.set(num);
    }
  }
}
