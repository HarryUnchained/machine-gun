import { Component, inject, signal, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SocketService } from '../../services/socket.service';
import { IconComponent } from '../icon/icon.component';
import type { CustomTemplate, CustomModule } from '@machine-gun/common';

@Component({
  selector: 'app-custom-data-manager',
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './custom-data-manager.component.html',
})
export class CustomDataManagerComponent {
  private static readonly TAB_TEMPLATES = 'templates';
  private static readonly TAB_DICTIONARIES = 'dictionaries';

  protected readonly socketService = inject(SocketService);
  public readonly close = output<void>();
  public readonly mode = input<'all' | 'dictionaries'>('all');

  protected readonly activeTab = signal<'templates' | 'dictionaries'>(
    CustomDataManagerComponent.TAB_TEMPLATES,
  );

  protected readonly newTemplateName = signal('');
  protected readonly newTemplateCategory = signal('');
  protected readonly newTemplateContent = signal('');

  protected readonly newModuleName = signal('');
  protected readonly newModuleValues = signal('');

  protected saveTemplate(): void {
    const name = this.newTemplateName().trim();
    const category = this.newTemplateCategory().trim();
    const content = this.newTemplateContent().trim();

    if (!name || !category || !content) {
      return;
    }

    const template: CustomTemplate = {
      id: crypto.randomUUID(),
      name,
      category,
      template: content,
    };

    this.socketService.saveCustomTemplate(template);

    this.newTemplateName.set('');
    this.newTemplateContent.set('');
  }

  protected saveModule(): void {
    const name = this.newModuleName().trim();
    const rawValues = this.newModuleValues().trim();

    if (!name || !rawValues) {
      return;
    }

    const values: string[] = [];
    const parts = rawValues.split(',');
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed.length > 0) {
        values.push(trimmed);
      }
    }

    if (values.length === 0) {
      return;
    }

    const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '');

    const module: CustomModule = {
      id: crypto.randomUUID(),
      name: sanitizedName,
      values,
    };

    this.socketService.saveCustomModule(module);

    this.newModuleName.set('');
    this.newModuleValues.set('');
  }
}
