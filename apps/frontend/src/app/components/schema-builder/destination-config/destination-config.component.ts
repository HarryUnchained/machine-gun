import {
  Component,
  input,
  output,
  signal,
  computed,
  ChangeDetectionStrategy,
  type OnInit,
} from '@angular/core';
import { JsonPipe } from '@angular/common';
import { TransportType, RabbitMQHeaderHints } from '@machine-gun/common';
import type { MessageDestination, SchemaField, KafkaKeyConfig } from '@machine-gun/common';
import { IconComponent } from '../../icon/icon.component';
import { SelectComponent, type SelectOption } from '../../select/select.component';
import { StepperComponent } from '../../stepper/stepper.component';

type DestinationPatch = { [K in keyof MessageDestination]?: MessageDestination[K] | undefined };

@Component({
  selector: 'app-destination-config',
  imports: [IconComponent, SelectComponent, StepperComponent, JsonPipe],
  templateUrl: './destination-config.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationConfigComponent implements OnInit {
  readonly TransportType = TransportType;
  protected readonly now = signal(new Date());

  private static readonly PROTOCOL_OPTIONS: SelectOption<TransportType>[] = [
    { value: TransportType.RABBITMQ, label: 'RabbitMQ', icon: 'rabbitmq' },
    { value: TransportType.KAFKA, label: 'Kafka', icon: 'kafka' },
  ];

  private static readonly TARGET_TYPE_OPTIONS: SelectOption<'exchange' | 'queue'>[] = [
    { value: 'exchange', label: 'Exchange', icon: 'exchange' },
    { value: 'queue', label: 'Queue', icon: 'queue' },
  ];

  private static readonly EXCHANGE_TYPE_OPTIONS: SelectOption<
    'direct' | 'topic' | 'fanout' | 'headers'
  >[] = [
    { value: 'direct', label: 'Direct', icon: 'direct' },
    { value: 'topic', label: 'Topic', icon: 'topic' },
    { value: 'fanout', label: 'Fanout', icon: 'fanout' },
    { value: 'headers', label: 'Headers', icon: 'headers' },
  ];

  public readonly destination = input.required<MessageDestination>();
  public readonly schemaFields = input<SchemaField[]>([]);
  public readonly lastSample = input<Record<string, unknown> | null>(null);
  public readonly rpcResponse = input<unknown>(null);
  public readonly isValid = input<boolean>(false);

  public readonly destinationChange = output<DestinationPatch>();
  public readonly testRpc = output<void>();

  protected readonly protocolOptions = DestinationConfigComponent.PROTOCOL_OPTIONS;
  protected readonly targetTypeOptions = DestinationConfigComponent.TARGET_TYPE_OPTIONS;
  protected readonly exchangeTypeOptions = DestinationConfigComponent.EXCHANGE_TYPE_OPTIONS;

  protected readonly fieldPaths = computed(() => this.extractPaths(this.schemaFields()));

  protected readonly kafkaKeyPreview = computed(() => {
    const cfg = this.destination().kafkaKey;
    const sample = this.lastSample();
    if (!cfg || cfg.mode !== 'field' || !cfg.fieldPath || !sample) return null;
    return this.resolvePath(sample, cfg.fieldPath);
  });

  protected readonly kafkaKeyPreviewWarning = computed(() => {
    const v = this.kafkaKeyPreview();
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'object') return 'object';
    return null;
  });

  protected customHeaders = signal<{ key: string; value: string }[]>([]);

  protected activeHeaderIndex = signal<number | null>(null);
  protected headerAutocompleteQuery = signal('');
  protected headerAutocompleteType = signal<'key' | 'value'>('key');

  protected filteredHeaderKeys = computed(() => {
    const query = this.headerAutocompleteQuery().toLowerCase();
    const filtered = [];
    for (const k of RabbitMQHeaderHints.keys) {
      if (k.toLowerCase().includes(query)) filtered.push(k);
    }
    return filtered;
  });

  protected filteredHeaderValues = computed(() => {
    const idx = this.activeHeaderIndex();
    if (idx === null) return [];
    const headers = this.customHeaders();
    const key = headers[idx]?.key;
    if (!key) return [];
    const query = this.headerAutocompleteQuery().toLowerCase();
    const hints = (RabbitMQHeaderHints.values as Record<string, readonly string[]>)[key] || [];
    const filtered = [];
    for (const v of hints) {
      if (v.toLowerCase().includes(query)) filtered.push(v);
    }
    return filtered;
  });

  ngOnInit() {
    const headers = this.destination().headers;
    if (headers) {
      const entries = [];
      for (const [key, value] of Object.entries(headers)) {
        entries.push({ key, value });
      }
      this.customHeaders.set(entries);
    }
  }

  protected update(patch: DestinationPatch) {
    this.destinationChange.emit(patch);
  }

  protected updateTransport(transport: TransportType) {
    if (transport === TransportType.KAFKA) {
      this.destinationChange.emit({
        transport,
        targetType: undefined,
        exchangeType: undefined,
        isRpc: undefined,
        autoDelete: undefined,
        exclusive: undefined,
        deadLetterExchange: undefined,
        deadLetterRoutingKey: undefined,
        queueMessageTtl: undefined,
        queueExpires: undefined,
        maxLength: undefined,
        maxPriority: undefined,
        messageTtl: undefined,
        priority: undefined,
        persistent: undefined,
        headers: undefined,
        rpcTimeout: undefined,
        kafkaKey: this.destination().kafkaKey ?? { mode: 'none' },
      });
      this.customHeaders.set([]);
      return;
    }

    this.destinationChange.emit({
      transport,
      targetType: this.destination().targetType ?? 'exchange',
      exchangeType: this.destination().exchangeType ?? 'direct',
      assertTarget: this.destination().assertTarget ?? false,
      durableTarget: this.destination().durableTarget ?? true,
      kafkaPartition: undefined,
      kafkaKey: undefined,
    });
  }

  protected updateKafkaKey(patch: Partial<KafkaKeyConfig>) {
    const current = this.destination().kafkaKey ?? { mode: 'none' };
    this.destinationChange.emit({ kafkaKey: { ...current, ...patch } });
  }

  protected setKafkaKeyMode(mode: KafkaKeyConfig['mode']) {
    if (mode === 'none' || mode === 'uuid') {
      this.destinationChange.emit({
        kafkaKey: {
          mode,
        },
      });
      return;
    }

    if (mode === 'field') {
      const fieldPath = this.destination().kafkaKey?.fieldPath?.trim();
      this.destinationChange.emit({
        kafkaKey: {
          mode,
          ...(fieldPath ? { fieldPath } : {}),
        },
      });
      return;
    }

    const customValue = this.destination().kafkaKey?.customValue?.trim();
    this.destinationChange.emit({
      kafkaKey: {
        mode,
        ...(customValue ? { customValue } : {}),
      },
    });
  }

  private extractPaths(fields: SchemaField[], prefix = ''): string[] {
    const paths: string[] = [];
    for (const f of fields) {
      const path = prefix ? `${prefix}.${f.name}` : f.name;
      paths.push(path);
      if (f.fields && f.fields.length > 0) {
        paths.push(...this.extractPaths(f.fields, path));
      }
    }
    return paths;
  }

  private resolvePath(obj: Record<string, unknown>, path: string): unknown {
    let current: unknown = obj;
    const parts = path.split('.');

    for (const key of parts) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  protected addHeader() {
    this.customHeaders.update((h) => [...h, { key: '', value: '' }]);
  }

  protected updateHeader(index: number, updates: Partial<{ key: string; value: string }>) {
    this.customHeaders.update((h) => {
      const newH: { key: string; value: string }[] = [];
      for (let i = 0; i < h.length; i++) {
        const item = h[i] as { key: string; value: string };
        newH.push(i === index ? { ...item, ...updates } : item);
      }
      return newH;
    });
    this.syncHeaders();

    if (this.activeHeaderIndex() === index) {
      if (updates.key !== undefined) this.headerAutocompleteQuery.set(updates.key);
      if (updates.value !== undefined) this.headerAutocompleteQuery.set(updates.value);
    }
  }

  protected removeHeader(index: number) {
    this.customHeaders.update((h) => {
      const newH: { key: string; value: string }[] = [];
      for (let i = 0; i < h.length; i++) {
        if (i !== index) newH.push(h[i] as { key: string; value: string });
      }
      return newH;
    });
    this.syncHeaders();
    if (this.activeHeaderIndex() === index) {
      this.activeHeaderIndex.set(null);
    }
  }

  protected selectHeaderHint(value: string) {
    const idx = this.activeHeaderIndex();
    if (idx === null) return;

    if (this.headerAutocompleteType() === 'key') {
      this.updateHeader(idx, { key: value });
    } else {
      this.updateHeader(idx, { value: value });
    }
    this.activeHeaderIndex.set(null);
  }

  protected openHeaderAutocomplete(index: number, type: 'key' | 'value', query: string) {
    this.activeHeaderIndex.set(index);
    this.headerAutocompleteType.set(type);
    this.headerAutocompleteQuery.set(query);
  }

  private syncHeaders() {
    const record: Record<string, string> = {};
    for (const h of this.customHeaders()) {
      if (h.key.trim()) record[h.key.trim()] = h.value;
    }
    const patch: DestinationPatch = {};
    if (Object.keys(record).length > 0) {
      patch.headers = record;
    } else {
      patch.headers = undefined;
    }
    this.destinationChange.emit(patch);
  }
}
