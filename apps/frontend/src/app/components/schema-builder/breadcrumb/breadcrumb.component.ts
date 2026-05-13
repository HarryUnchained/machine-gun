import { Component, input, output } from '@angular/core';
import { type SchemaField } from '@machine-gun/common';
import { IconComponent } from '../../icon/icon.component';

@Component({
  selector: 'app-breadcrumb',
  imports: [IconComponent],
  template: `
    <div
      class="flex items-center gap-2 py-2 px-3 bg-brand-surface/50 rounded-xl border border-brand-border/30 overflow-x-auto no-scrollbar"
    >
      <button
        (click)="navigate.emit(-1)"
        class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors"
        [class.text-brand-primary]="path().length > 0"
        [class.text-brand-text-muted]="path().length === 0"
        [disabled]="path().length === 0"
      >
        <app-icon name="account_tree" [size]="14"></app-icon>
        Root
      </button>

      @for (crumb of path(); track $index) {
        <div class="flex items-center gap-2 animate-in slide-in-from-left-2">
          <app-icon name="chevron_right" [size]="14" class="text-brand-text-muted/30"></app-icon>
          <button
            (click)="navigate.emit($index)"
            class="px-2 py-1 bg-brand-overlay border border-brand-border/50 rounded-lg text-[10px] font-black uppercase tracking-widest text-brand-text hover:border-brand-primary/50 transition-all whitespace-nowrap"
            [class.text-brand-primary]="$index === path().length - 1"
          >
            {{ crumb.parent.name || 'unnamed' }}
          </button>
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
})
export class BreadcrumbComponent {
  public readonly path = input<{ parent: SchemaField }[]>([]);
  public readonly navigate = output<number>();
}
