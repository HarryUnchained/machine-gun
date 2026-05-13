import { Component, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { GeneratorFieldType } from '@machine-gun/common';
import type { SchemaField, FieldOptions, CustomModule } from '@machine-gun/common';
import { IconComponent } from '../../icon/icon.component';
import { DatetimePickerComponent } from '../../datetime-picker/datetime-picker.component';
import { SelectComponent, type SelectOption } from '../../select/select.component';
import { StepperComponent } from '../../stepper/stepper.component';

@Component({
  selector: 'app-field-row',
  imports: [IconComponent, DatetimePickerComponent, SelectComponent, StepperComponent],
  templateUrl: './field-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldRowComponent {
  private static readonly LOCATION_FORMAT_OPTIONS: SelectOption<string>[] = [
    { value: 'object', label: 'Object ({lat, lng})' },
    { value: 'array', label: 'Array ([lat, lng])' },
    { value: 'lat', label: 'Latitude only' },
    { value: 'lng', label: 'Longitude only' },
  ];

  private static readonly REGEX_EXAMPLES = [
    { label: 'Grouping & Piping', pattern: 'hello+ (world|to you)' },
    { label: 'Sets & References', pattern: '<([a-z]\\w{0,20})>foo<\\1>' },
    { label: 'Wildcard', pattern: 'random stuff: .+' },
    { label: 'UUID', pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' },
    { label: 'Phone Number', pattern: '\\+1-[0-9]{3}-[0-9]{3}-[0-9]{4}' },
    {
      label: 'IPv4 Address',
      pattern:
        '(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])\\.(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])\\.(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])\\.(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])',
    },
  ];

  public readonly GeneratorFieldType = GeneratorFieldType;

  public readonly field = input.required<SchemaField>();
  public readonly index = input.required<number>();
  public readonly fieldTypeOptions = input.required<SelectOption<GeneratorFieldType>[]>();
  public readonly fakerHints = input.required<string[]>();
  public readonly customModules = input.required<CustomModule[]>();
  public readonly groupedCustomTemplates =
    input.required<{ category: string; items: string[] }[]>();

  public readonly fieldUpdate = output<Partial<SchemaField>>();
  public readonly fieldOptionsUpdate =
    output<{ [K in keyof FieldOptions]?: FieldOptions[K] | undefined }>();
  public readonly remove = output<void>();
  public readonly openCustomData = output<'all' | 'dictionaries'>();
  public readonly drillDown = output<void>();

  protected readonly locationFormatOptions = FieldRowComponent.LOCATION_FORMAT_OPTIONS;
  protected readonly regexExamples = FieldRowComponent.REGEX_EXAMPLES;

  protected readonly autocompleteOpen = signal(false);
  protected readonly autocompleteQuery = signal('');
  protected readonly autocompleteCursorPos = signal(0);
  protected readonly showTemplateInfo = signal(false);
  protected readonly showRegexInfo = signal(false);
  protected readonly showDatetimeInfo = signal(false);
  protected readonly showObjectInfo = signal(false);
  protected readonly showArrayInfo = signal(false);
  protected readonly showLocationInfo = signal(false);
  protected readonly isExpanded = signal(true);

  protected readonly rowFieldTypeOptions = computed(() => {
    const result = [];
    const type = this.field().type;

    for (const opt of this.fieldTypeOptions()) {
      // number type consolidation (INT/FLOAT share a single row option)
      if (opt.value === GeneratorFieldType.INT || opt.value === GeneratorFieldType.FLOAT) {
        const isNumeric = type === GeneratorFieldType.INT || type === GeneratorFieldType.FLOAT;
        result.push({
          ...opt,
          value: isNumeric ? type : GeneratorFieldType.INT,
          label: isNumeric
            ? type === GeneratorFieldType.FLOAT
              ? 'Number (Float)'
              : 'Number (Integer)'
            : 'Number',
        });
        continue;
      }

      // datetime type consolidation (ISO/Unix/Native share a single row option)
      if (
        opt.value === GeneratorFieldType.ISO_TIMESTAMP ||
        opt.value === GeneratorFieldType.UNIX_DATETIME ||
        opt.value === GeneratorFieldType.DATETIME
      ) {
        const isDate =
          type === GeneratorFieldType.ISO_TIMESTAMP ||
          type === GeneratorFieldType.UNIX_DATETIME ||
          type === GeneratorFieldType.DATETIME;

        if (!isDate) {
          result.push({ ...opt, value: GeneratorFieldType.ISO_TIMESTAMP, label: 'Datetime' });
          continue;
        }

        let label = 'Datetime (ISO)';
        if (type === GeneratorFieldType.UNIX_DATETIME) {
          label = 'Datetime (Unix)';
        } else if (type === GeneratorFieldType.DATETIME) {
          label = 'Datetime (Native)';
        }

        result.push({ ...opt, value: type, label });
        continue;
      }

      result.push(opt);
    }

    return result;
  });

  protected readonly locationExample = computed(() => {
    const format = this.field().options?.format || 'object';
    const lat = this.field().options?.latitude || 51.5074;
    const lng = this.field().options?.longitude || -0.1278;

    switch (format) {
      case 'object':
        return `{ "lat": ${lat}, "lng": ${lng} }`;
      case 'array':
        return `[ ${lat}, ${lng} ]`;
      case 'lat':
        return `${lat}`;
      case 'lng':
        return `${lng}`;
      default:
        return `{ "lat": ${lat}, "lng": ${lng} }`;
    }
  });

  protected readonly datetimeExamples = computed(() => {
    const timestamp = this.field().options?.min ?? this.getDefaultDatetimeExample();
    const includeTime = this.datetimeIncludesTime();
    const date = new Date(timestamp);

    if (!includeTime) {
      date.setHours(0, 0, 0, 0);
    }

    return {
      iso: date.toISOString(),
      unix: Math.floor(date.getTime() / 1000),
      native: date.toString(),
    };
  });

  protected readonly structurePreviewFields = computed(() => {
    const fields = this.field().fields ?? [];
    return fields.slice(0, 6);
  });

  protected readonly hiddenStructureFieldCount = computed(() => {
    const totalFields = this.field().fields?.length ?? 0;
    return Math.max(0, totalFields - this.structurePreviewFields().length);
  });

  protected readonly filteredAutocompleteTags = computed(() => {
    const query = this.autocompleteQuery().toLowerCase();
    const customNamespaces = [];
    for (const m of this.customModules()) {
      customNamespaces.push(`custom.${m.name}`);
    }

    const allTags = [...customNamespaces, ...this.fakerHints()];
    if (!query) {
      return allTags.slice(0, 30);
    }

    const filtered = [];
    for (const t of allTags) {
      if (t.toLowerCase().includes(query)) {
        filtered.push(t);
      }
      if (filtered.length === 30) {
        break;
      }
    }
    return filtered;
  });

  protected updateChildField(childIndex: number, updates: Partial<SchemaField>): void {
    const currentFields = this.field().fields || [];
    const newFields: SchemaField[] = [];
    for (let i = 0; i < currentFields.length; i++) {
      const f = currentFields[i] as SchemaField;
      if (i === childIndex) {
        newFields.push({ ...f, ...updates });
      } else {
        newFields.push(f);
      }
    }
    this.fieldUpdate.emit({ fields: newFields });
  }

  protected updateChildFieldOptions(
    childIndex: number,
    optionUpdates: { [K in keyof FieldOptions]?: FieldOptions[K] | undefined },
  ): void {
    const currentFields = this.field().fields || [];
    const newFields: SchemaField[] = [];
    for (let i = 0; i < currentFields.length; i++) {
      const f = currentFields[i] as SchemaField;
      if (i !== childIndex) {
        newFields.push(f);
        continue;
      }

      const opts = { ...(f.options ?? {}) } as Record<string, unknown>;
      for (const [key, value] of Object.entries(optionUpdates)) {
        if (value === undefined) {
          delete opts[key];
        } else {
          opts[key] = value;
        }
      }
      newFields.push({ ...f, options: opts });
    }
    this.fieldUpdate.emit({ fields: newFields });
  }

  protected addChildField(): void {
    const currentFields = this.field().fields || [];
    this.fieldUpdate.emit({
      fields: [...currentFields, { name: '', type: GeneratorFieldType.STRING }],
    });
  }

  protected removeChildField(childIndex: number): void {
    const currentFields = this.field().fields || [];
    const newFields: SchemaField[] = [];
    for (let i = 0; i < currentFields.length; i++) {
      if (i !== childIndex) {
        newFields.push(currentFields[i] as SchemaField);
      }
    }
    this.fieldUpdate.emit({ fields: newFields });
  }

  protected getStringMode(field: SchemaField): 'random' | 'choices' | 'faker' | 'template' {
    if (field.options?.choices !== undefined) {
      return 'choices';
    }
    if (field.options?.faker !== undefined) {
      return 'faker';
    }
    if (field.options?.template !== undefined) {
      return 'template';
    }
    return 'random';
  }

  protected convertChoices(value: string): string[] {
    const result = [];
    const parts = value.split(',');
    for (const s of parts) {
      const trimmed = s.trim();
      if (trimmed.length > 0) {
        result.push(trimmed);
      }
    }
    return result;
  }

  protected convertWeights(value: string): number[] {
    const result = [];
    const parts = value.split(',');
    for (const s of parts) {
      const n = parseFloat(s.trim());
      if (!isNaN(n)) {
        result.push(n);
      }
    }
    return result;
  }

  protected weightsToString(weights?: number[]): string {
    return weights?.join(', ') ?? '';
  }

  protected weightsTotal(weights?: number[]): number {
    if (!weights) {
      return 0;
    }
    let total = 0;
    for (const w of weights) {
      total += w;
    }
    return total;
  }

  protected getStructureLabel(): string {
    if (this.field().type === GeneratorFieldType.OBJECT) {
      return 'Object Properties';
    }
    return 'Item Structure';
  }

  protected getArrayCountMode(): 'fixed' | 'random' | 'range' {
    return this.field().options?.countMode ?? 'fixed';
  }

  protected getArrayFixedCount(): number {
    return this.field().options?.count ?? 3;
  }

  protected getArrayRandomMax(): number {
    return this.field().options?.countMax ?? 10;
  }

  protected getArrayRangeMin(): number {
    return this.field().options?.countMin ?? 1;
  }

  protected getArrayRangeMax(): number {
    const min = this.getArrayRangeMin();
    const max = this.field().options?.countMax ?? 5;
    return max < min ? min : max;
  }

  protected setArrayCountMode(mode: 'fixed' | 'random' | 'range'): void {
    if (mode === 'random') {
      this.fieldOptionsUpdate.emit({
        countMode: 'random',
        count: undefined,
        countMin: undefined,
        countMax: this.getArrayRandomMax(),
      });
      return;
    }

    if (mode === 'range') {
      const min = this.getArrayRangeMin();
      const max = this.getArrayRangeMax();
      this.fieldOptionsUpdate.emit({
        countMode: 'range',
        count: undefined,
        countMin: min,
        countMax: max < min ? min : max,
      });
      return;
    }

    this.fieldOptionsUpdate.emit({
      countMode: 'fixed',
      count: this.getArrayFixedCount(),
      countMin: undefined,
      countMax: undefined,
    });
  }

  protected formatFieldTypeLabel(type: GeneratorFieldType): string {
    switch (type) {
      case GeneratorFieldType.STRING:
        return 'String';
      case GeneratorFieldType.INT:
        return 'Integer';
      case GeneratorFieldType.FLOAT:
        return 'Float';
      case GeneratorFieldType.BOOLEAN:
        return 'Boolean';
      case GeneratorFieldType.NULL:
        return 'Null';
      case GeneratorFieldType.DATETIME:
        return 'Datetime';
      case GeneratorFieldType.UNIX_DATETIME:
        return 'Unix Time';
      case GeneratorFieldType.ISO_TIMESTAMP:
        return 'ISO Time';
      case GeneratorFieldType.CRON:
        return 'Cron';
      case GeneratorFieldType.UUID:
        return 'UUID';
      case GeneratorFieldType.REGEX:
        return 'Regex';
      case GeneratorFieldType.LOCATION:
        return 'Geospatial';
      case GeneratorFieldType.OBJECT:
        return 'Object';
      case GeneratorFieldType.ARRAY:
        return 'Array';
      default:
        return 'Field';
    }
  }

  protected setStringMode(mode: 'random' | 'choices' | 'faker' | 'template'): void {
    const field = this.field();
    if (mode === 'choices') {
      this.fieldOptionsUpdate.emit({
        choices: field.options?.choices || [],
        faker: undefined,
        template: undefined,
      });
    } else if (mode === 'faker') {
      this.fieldOptionsUpdate.emit({
        faker: field.options?.faker || 'airline.flightNumber',
        choices: undefined,
        template: undefined,
      });
    } else if (mode === 'template') {
      this.fieldOptionsUpdate.emit({
        template: field.options?.template || '{{person.firstName}} {{person.lastName}}',
        choices: undefined,
        faker: undefined,
      });
    } else {
      this.fieldOptionsUpdate.emit({ choices: undefined, faker: undefined, template: undefined });
    }
    this.autocompleteOpen.set(false);
  }

  protected setNumberType(type: GeneratorFieldType): void {
    this.fieldUpdate.emit({ type });
  }

  protected setDateFormat(format: GeneratorFieldType): void {
    this.fieldUpdate.emit({ type: format });
  }

  protected datetimeIncludesTime(): boolean {
    return this.field().options?.includeTime !== false;
  }

  protected setDatetimeTimeEnabled(enabled: boolean): void {
    const currentMin = this.field().options?.min;
    const currentMax = this.field().options?.max;

    if (enabled) {
      this.fieldOptionsUpdate.emit({
        includeTime: true,
      });
      return;
    }

    this.fieldOptionsUpdate.emit({
      includeTime: false,
      min: currentMin !== undefined ? this.startOfDay(currentMin) : undefined,
      max: currentMax !== undefined ? this.endOfDay(currentMax) : undefined,
    });
  }

  protected onTemplateInput(event: Event, inputEl: HTMLInputElement | HTMLTextAreaElement): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    const cursorPos = inputEl.selectionStart ?? 0;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastOpen = textBeforeCursor.lastIndexOf('{{');
    const lastClose = textBeforeCursor.lastIndexOf('}}');

    if (lastOpen > lastClose && lastOpen !== -1) {
      this.autocompleteQuery.set(textBeforeCursor.substring(lastOpen + 2));
      this.autocompleteCursorPos.set(cursorPos);
      this.autocompleteOpen.set(true);
    } else {
      this.autocompleteOpen.set(false);
    }
    this.fieldOptionsUpdate.emit({ template: value });
  }

  protected selectTag(tag: string, inputEl: HTMLInputElement | HTMLTextAreaElement): void {
    const field = this.field();
    const currentValue = field.options?.template || '';
    const textBeforeCursor = currentValue.substring(0, this.autocompleteCursorPos());
    const textAfterCursor = currentValue.substring(this.autocompleteCursorPos());
    const lastOpen = textBeforeCursor.lastIndexOf('{{');

    const newBefore = textBeforeCursor.substring(0, lastOpen) + '{{' + tag + '}}';
    const closeIdx = textAfterCursor.indexOf('}}');

    let newAfter = textAfterCursor;
    if (closeIdx !== -1 && !textAfterCursor.substring(0, closeIdx).includes('{{')) {
      newAfter = textAfterCursor.substring(closeIdx + 2);
    }

    this.fieldOptionsUpdate.emit({ template: newBefore + newAfter });
    this.autocompleteOpen.set(false);

    setTimeout(() => {
      inputEl.focus();
      inputEl.setSelectionRange(newBefore.length, newBefore.length);
    }, 0);
  }

  private getDefaultDatetimeExample(): number {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.getTime();
  }

  private startOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  private endOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }
}
