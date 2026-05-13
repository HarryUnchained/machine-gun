import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SchemaBuilderComponent } from './schema-builder.component';
import { SocketService } from '../../services/socket.service';
import { ImportService } from '../../services/import.service';
import { signal } from '@angular/core';
import { GeneratorFieldType, TransportType, type SchemaDefinition } from '@machine-gun/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SchemaBuilderComponent', () => {
  let component: SchemaBuilderComponent;
  let fixture: ComponentFixture<SchemaBuilderComponent>;
  let mockSocketService: any;
  let mockImportService: any;

  beforeEach(async () => {
    mockSocketService = {
      fakerNamespaces: signal([]),
      customModules: signal([]),
      customTemplates: signal([]),
      createSchema: vi.fn(),
      schemas: signal([]),
      rpcResponses: signal({}), // Added
    };

    mockImportService = {
      parseJson: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SchemaBuilderComponent],
      providers: [
        { provide: SocketService, useValue: mockSocketService },
        { provide: ImportService, useValue: mockImportService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SchemaBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with an empty schema', () => {
    const s = component.schema();
    expect(s.fields).toHaveLength(0);
    expect(s.destination.transport).toBe(TransportType.RABBITMQ);
  });

  it('should compute rpcResponse correctly', () => {
    const s = component.schema();
    s.id = 'test-schema';
    component.schema.set({ ...s });

    mockSocketService.rpcResponses.set({ 'test-schema': { data: 'hello' } });
    fixture.detectChanges();

    expect(component['rpcResponse']()).toEqual({ data: 'hello' });
  });

  it('should initialize with editSchema if provided', () => {
    const existing: SchemaDefinition = {
      id: 'existing',
      name: 'Existing',
      fields: [{ name: 'f1', type: GeneratorFieldType.UUID }],
      destination: { transport: TransportType.KAFKA, target: 'topic' },
      defaultFrequency: 1,
      source: 'dynamic',
    };

    fixture.componentRef.setInput('editSchema', existing);
    component.ngOnInit();

    expect(component.schema().id).toBe('existing');
    expect(component.schema().fields).toHaveLength(1);
  });

  it('should add and remove fields', () => {
    component['addField']();
    expect(component.schema().fields).toHaveLength(1);
    expect(component.schema().fields[0]!.type).toBe(GeneratorFieldType.STRING);

    component['removeField'](0);
    expect(component.schema().fields).toHaveLength(0);
  });

  it('should update schema properties and slugify the ID', () => {
    component['updateSchema']({ name: 'New Name', id: 'My New Schema!' });
    expect(component.schema().name).toBe('New Name');
    expect(component.schema().id).toBe('my-new-schema');
  });

  it('should update destination configuration', () => {
    component['updateDestination']({ target: 'my-queue', isRpc: true });
    expect(component.schema().destination.target).toBe('my-queue');
    expect(component.schema().destination.isRpc).toBe(true);
  });

  it('should validate the schema correctly', () => {
    expect(component['isValid']()).toBe(false); // Empty

    component['updateSchema']({ name: 'Test', id: 'test' });
    component['updateDestination']({ target: 'test.exchange' });
    component['addField'](); // Adds field with empty name by default

    expect(component['isValid']()).toBe(false); // Field name is missing

    const s = component.schema();
    s.fields[0]!.name = 'f1';
    component.schema.set({ ...s }); // Trigger update

    expect(component['isValid']()).toBe(true);
  });

  it('should require a topic for Kafka schemas', () => {
    component['updateSchema']({ name: 'Kafka Test', id: 'kafka-test' });
    component['updateDestination']({ transport: TransportType.KAFKA, target: '' });
    component['addField']();

    const s = component.schema();
    s.fields[0]!.name = 'f1';
    component.schema.set({ ...s });

    expect(component['isValid']()).toBe(false);
    expect(component['validationMessage']()).toBe('Kafka topic is required');
  });

  it('should require fieldPath when Kafka key mode is field', () => {
    component['updateSchema']({ name: 'Kafka Test', id: 'kafka-test' });
    component['updateDestination']({
      transport: TransportType.KAFKA,
      target: 'events.test',
      kafkaKey: { mode: 'field' },
    });
    component['addField']();

    const s = component.schema();
    s.fields[0]!.name = 'f1';
    component.schema.set({ ...s });

    expect(component['isValid']()).toBe(false);
    expect(component['validationMessage']()).toBe('Kafka field key path is required');
  });

  it('should save the schema via socket service', () => {
    component['updateSchema']({ name: 'Test', id: 'test' });
    component['updateDestination']({ target: 'test.exchange' });
    component['addField']();

    const s = component.schema();
    s.fields[0]!.name = 'f1';
    component.schema.set({ ...s });

    component['save']();

    expect(mockSocketService.createSchema).toHaveBeenCalled();
  });

  it('should detect system schema overrides', () => {
    mockSocketService.schemas.set([
      {
        id: 'system-id',
        name: 'System Schema',
        source: 'static',
        fields: [],
        destination: {} as any,
        defaultFrequency: 1,
      },
    ]);

    component['updateSchema']({ id: 'system-id' });
    expect(component['staticOverrideInfo']()).toEqual({ id: 'system-id', name: 'System Schema' });
  });

  it('should detect dynamic schema collisions', () => {
    mockSocketService.schemas.set([
      {
        id: 'custom-id',
        name: 'Custom Schema',
        source: 'dynamic',
        fields: [],
        destination: {} as any,
        defaultFrequency: 1,
      },
    ]);

    component['originalId'].set('original-id');
    component['updateSchema']({ id: 'custom-id' });
    expect(component['dynamicCollisionInfo']()).toEqual({ name: 'Custom Schema' });
  });
});
