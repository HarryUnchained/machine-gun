import {
  Component,
  inject,
  input,
  output,
  signal,
  computed,
  ChangeDetectionStrategy,
  type OnInit,
} from '@angular/core';
import { GeneratorFieldType, TransportType } from '@machine-gun/common';
import type {
  SchemaDefinition,
  SchemaField,
  FieldOptions,
  MessageDestination,
} from '@machine-gun/common';
import { SocketService } from '../../services/socket.service';
import { ImportService } from '../../services/import.service';
import { IconComponent } from '../icon/icon.component';
import { CustomDataManagerComponent } from '../custom-data-manager/custom-data-manager.component';
import { DestinationConfigComponent } from './destination-config/destination-config.component';
import { FieldRowComponent } from './field-row/field-row.component';
import { BreadcrumbComponent } from './breadcrumb/breadcrumb.component';
import { type SelectOption } from '../select/select.component';

@Component({
  selector: 'app-schema-builder',
  imports: [
    IconComponent,
    CustomDataManagerComponent,
    DestinationConfigComponent,
    BreadcrumbComponent,
    FieldRowComponent,
  ],
  templateUrl: './schema-builder.component.html',
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchemaBuilderComponent implements OnInit {
  private static readonly FIELD_TYPE_OPTIONS: SelectOption<GeneratorFieldType>[] = [
    { value: GeneratorFieldType.INT, label: 'Number', icon: 'number' },
    { value: GeneratorFieldType.ISO_TIMESTAMP, label: 'Datetime', icon: 'timestamp' },
    { value: GeneratorFieldType.UUID, label: 'UUID (v4)', icon: 'uuid' },
    { value: GeneratorFieldType.STRING, label: 'String', icon: 'string' },
    { value: GeneratorFieldType.REGEX, label: 'Regex', icon: 'regex' },
    { value: GeneratorFieldType.BOOLEAN, label: 'Boolean', icon: 'toggle' },
    { value: GeneratorFieldType.NULL, label: 'Null', icon: 'close' },
    { value: GeneratorFieldType.CRON, label: 'Cron Expression', icon: 'timer' },
    { value: GeneratorFieldType.LOCATION, label: 'Geospatial', icon: 'map' },
    { value: GeneratorFieldType.OBJECT, label: 'Nested Object', icon: 'data_object' },
    { value: GeneratorFieldType.ARRAY, label: 'Object Array', icon: 'data_array' },
  ];

  private readonly socketService = inject(SocketService);
  private readonly importService = inject(ImportService);

  public readonly editSchema = input<SchemaDefinition | null>(null);
  public readonly close = output<void>();

  protected readonly fieldTypeOptions = SchemaBuilderComponent.FIELD_TYPE_OPTIONS;
  protected readonly GeneratorFieldType = GeneratorFieldType;
  protected readonly customModules = this.socketService.customModules;

  protected readonly fakerHints = computed(() => {
    const baseNamespaces = this.socketService.fakerNamespaces();
    const customNamespaces: string[] = [];

    for (const m of this.socketService.customModules()) {
      customNamespaces.push(`custom.${m.name}`);
    }

    const merged = [...baseNamespaces, ...customNamespaces];
    return merged.sort();
  });

  protected readonly groupedCustomTemplates = computed(() => {
    const categories: Record<string, string[]> = {};
    for (const tpl of this.socketService.customTemplates()) {
      let list = categories[tpl.category];
      if (!list) {
        list = [];
        categories[tpl.category] = list;
      }
      list.push(tpl.template);
    }

    const result = [];
    for (const [category, items] of Object.entries(categories)) {
      result.push({ category, items });
    }
    return result;
  });

  protected readonly customDataModalMode = signal<'all' | 'dictionaries' | null>(null);
  protected readonly isMaximized = signal(false);
  protected readonly showHelp = signal(false);

  protected readonly navigationStack = signal<SchemaField[][]>([]);
  protected readonly navigationPath = signal<{ parent: SchemaField }[]>([]);

  protected readonly currentFields = computed(() => {
    // Access schema signal to trigger re-computation
    this.schema();
    const path = this.navigationPath();
    if (path.length === 0) {
      return this.schema().fields;
    }

    const last = path[path.length - 1];
    if (!last) {
      return this.schema().fields;
    }

    if (!last.parent.fields) {
      last.parent.fields = [];
    }
    return last.parent.fields;
  });

  public readonly schema = signal<SchemaDefinition>({
    id: '',
    name: '',
    fields: [],
    destination: {
      transport: TransportType.RABBITMQ,
      targetType: 'exchange',
      target: '',
      routingKey: '',
      isRpc: false,
      assertTarget: false,
      durableTarget: true,
      exchangeType: 'direct',
    },
    defaultFrequency: 1,
    source: 'dynamic',
  });

  protected readonly originalId = signal<string | null>(null);

  protected readonly staticOverrideInfo = computed(() => {
    const id = this.schema().id;
    if (!id) {
      return null;
    }

    for (const s of this.socketService.schemas()) {
      if (s.id === id && s.source === 'static') {
        return { name: s.name, id: s.id };
      }
    }
    return null;
  });

  protected readonly dynamicCollisionInfo = computed(() => {
    const id = this.schema().id;
    const originalId = this.originalId();
    if (!id || id === originalId) {
      return null;
    }

    for (const s of this.socketService.schemas()) {
      if (s.id === id && s.source === 'dynamic') {
        return { name: s.name };
      }
    }
    return null;
  });

  protected readonly rpcResponse = computed(() => {
    const id = this.schema().id;
    return this.socketService.rpcResponses()[id] || null;
  });

  protected readonly validationMessage = computed(() => this.getValidationMessage());

  public ngOnInit(): void {
    const existing = this.editSchema();
    if (existing) {
      this.schema.set(JSON.parse(JSON.stringify(existing)) as SchemaDefinition);
      this.originalId.set(existing.id);
    }

    const current = this.schema();
    const isRabbit = current.destination.transport === TransportType.RABBITMQ;
    const isInvalidTarget =
      current.destination.targetType !== 'exchange' && current.destination.targetType !== 'queue';

    if (isRabbit && isInvalidTarget) {
      this.updateDestination({ targetType: 'exchange' });
    }
  }

  protected updateSchema(updates: Partial<SchemaDefinition>): void {
    if (updates.id !== undefined) {
      // kebab-case IDs only
      updates.id = updates.id
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-');
    }
    this.schema.update((s) => ({ ...s, ...updates }));
  }

  protected updateDestination(updates: {
    [K in keyof MessageDestination]?: MessageDestination[K] | undefined;
  }): void {
    this.schema.update((s) => {
      const dest = { ...s.destination } as Record<string, unknown>;
      for (const [key, value] of Object.entries(updates) as [keyof MessageDestination, unknown][]) {
        if (value === undefined) {
          delete dest[key as string];
        } else {
          dest[key as string] = value;
        }
      }
      return { ...s, destination: dest as unknown as MessageDestination };
    });
  }

  protected updateField(index: number, updates: Partial<SchemaField>): void {
    const fields = this.currentFields();
    const updatedFields: SchemaField[] = [];

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i] as SchemaField;
      if (i !== index) {
        updatedFields.push(f);
        continue;
      }

      const newType = updates.type ?? f.type;
      const wasStructured =
        f.type === GeneratorFieldType.OBJECT || f.type === GeneratorFieldType.ARRAY;
      const isStructured =
        newType === GeneratorFieldType.OBJECT || newType === GeneratorFieldType.ARRAY;

      const updated = { ...f, ...updates };

      // Clear sub-fields if we're moving away from a structured type
      if (
        (wasStructured && !isStructured) ||
        (wasStructured && isStructured && f.type !== newType)
      ) {
        delete updated.fields;
      }

      // Reset options if the base category changed (e.g. going from numbers to dates)
      const isNumeric = (t: GeneratorFieldType) =>
        t === GeneratorFieldType.INT || t === GeneratorFieldType.FLOAT;
      const isDate = (t: GeneratorFieldType) =>
        t === GeneratorFieldType.ISO_TIMESTAMP ||
        t === GeneratorFieldType.UNIX_DATETIME ||
        t === GeneratorFieldType.DATETIME;

      const typeCategoryChanged =
        isNumeric(f.type) !== isNumeric(newType) &&
        isDate(f.type) !== isDate(newType) &&
        f.type !== newType;

      if (typeCategoryChanged && !isStructured) {
        delete updated.options;
      }

      updatedFields.push(updated);
    }

    this.applyFieldsUpdate(updatedFields);
  }

  protected updateFieldOptions(
    index: number,
    optionUpdates: { [K in keyof FieldOptions]?: FieldOptions[K] | undefined },
  ): void {
    const fields = this.currentFields();
    const field = fields[index];
    if (!field) {
      return;
    }

    const opts = { ...(field.options ?? {}) } as Record<string, unknown>;
    for (const [key, value] of Object.entries(optionUpdates)) {
      if (value === undefined) {
        delete opts[key];
      } else {
        opts[key] = value;
      }
    }

    const updatedFields: SchemaField[] = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i] as SchemaField;
      if (i === index) {
        updatedFields.push({ ...f, options: opts });
      } else {
        updatedFields.push(f);
      }
    }

    this.applyFieldsUpdate(updatedFields);
  }

  private applyFieldsUpdate(updatedFields: SchemaField[]): void {
    const path = this.navigationPath();
    if (path.length === 0) {
      this.schema.update((s) => ({
        ...s,
        fields: updatedFields,
      }));
    } else {
      const lastPathEntry = path[path.length - 1];
      if (lastPathEntry) {
        lastPathEntry.parent.fields = updatedFields;
      }
      this.schema.update((s) => ({ ...s }));
    }
  }

  protected addField(): void {
    const newField: SchemaField = { name: '', type: GeneratorFieldType.STRING };
    const path = this.navigationPath();

    if (path.length === 0) {
      this.schema.update((s) => ({
        ...s,
        fields: [...s.fields, newField],
      }));
    } else {
      const last = path[path.length - 1];
      if (last) {
        this.applyFieldsUpdate([...(last.parent.fields || []), newField]);
      }
    }
  }

  protected removeField(index: number): void {
    const path = this.navigationPath();
    if (path.length === 0) {
      this.schema.update((s) => {
        const nextFields: SchemaField[] = [];
        for (let i = 0; i < s.fields.length; i++) {
          if (i !== index) {
            nextFields.push(s.fields[i] as SchemaField);
          }
        }
        return { ...s, fields: nextFields };
      });
    } else {
      const last = path[path.length - 1];
      if (last) {
        const parentFields = last.parent.fields || [];
        const nextFields: SchemaField[] = [];
        for (let i = 0; i < parentFields.length; i++) {
          if (i !== index) {
            nextFields.push(parentFields[i] as SchemaField);
          }
        }
        this.applyFieldsUpdate(nextFields);
      }
    }
  }

  protected drillDown(field: SchemaField): void {
    const isStructured =
      field.type === GeneratorFieldType.OBJECT || field.type === GeneratorFieldType.ARRAY;
    if (isStructured) {
      if (!field.fields) {
        field.fields = [];
      }
      this.navigationPath.update((p) => [...p, { parent: field }]);
    }
  }

  protected navigateTo(index: number): void {
    this.navigationPath.update((p) => (index === -1 ? [] : p.slice(0, index + 1)));
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (file) {
      try {
        const parsed = await this.importService.parseJson(file);
        this.schema.update((s) => ({
          ...s,
          ...parsed,
          fields: parsed.fields?.length ? parsed.fields : s.fields,
        }));
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to import JSON');
      }
    }
  }

  protected isValid(): boolean {
    return this.getValidationMessage() === null;
  }

  private getValidationMessage(): string | null {
    const s = this.schema();
    if (!s.name?.trim()) {
      return 'Missing schema name';
    }
    if (!s.id?.trim()) {
      return 'Missing schema ID';
    }
    if (s.fields.length === 0) {
      return 'Add at least one field';
    }

    if (!s.destination.target?.trim()) {
      return s.destination.transport === TransportType.KAFKA
        ? 'Kafka topic is required'
        : 'Destination endpoint is required';
    }

    const isRabbit = s.destination.transport === TransportType.RABBITMQ;
    if (
      isRabbit &&
      s.destination.targetType !== 'exchange' &&
      s.destination.targetType !== 'queue'
    ) {
      return 'RabbitMQ target type is required';
    }

    if (s.destination.transport === TransportType.KAFKA) {
      if (s.destination.kafkaPartition !== undefined && s.destination.kafkaPartition < 0) {
        return 'Kafka partition must be zero or greater';
      }

      const key = s.destination.kafkaKey;
      if (key?.mode === 'field' && !key.fieldPath?.trim()) {
        return 'Kafka field key path is required';
      }

      if (key?.mode === 'custom' && !key.customValue?.trim()) {
        return 'Kafka custom key value is required';
      }
    }

    const validateFields = (fields: SchemaField[]): boolean => {
      if (!fields || fields.length === 0) {
        return true;
      }

      for (const f of fields) {
        if (!f.name?.trim()) {
          return false;
        }

        const isStructured =
          f.type === GeneratorFieldType.OBJECT || f.type === GeneratorFieldType.ARRAY;
        if (isStructured && f.fields) {
          if (!validateFields(f.fields)) {
            return false;
          }
        }
      }

      return true;
    };

    return validateFields(s.fields) ? null : 'Every field needs a name';
  }

  protected handleTestRpc(): void {
    const s = this.schema();
    if (!s.id) {
      return;
    }
    this.socketService.burstTest(s.id, 1, s);
  }

  protected save(): void {
    if (!this.isValid()) {
      return;
    }

    const current = { ...this.schema() };
    const original = this.originalId();
    const existing = this.editSchema();

    if (current.source === 'static' && existing) {
      const hasChanged = JSON.stringify(current) !== JSON.stringify(existing);
      if (!hasChanged) {
        this.close.emit();
        return;
      }
      current.isModified = true;
    }

    if (original) {
      this.socketService.updateSchema(original, current);
    } else {
      this.socketService.createSchema(current);
    }

    this.close.emit();
  }
}
