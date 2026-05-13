import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveHubComponent } from './live-hub.component';
import { SocketService } from '../../services/socket.service';
import { signal } from '@angular/core';

describe('LiveHubComponent', () => {
  let component: LiveHubComponent;
  let fixture: ComponentFixture<LiveHubComponent>;
  let mockSocketService: any;

  beforeEach(async () => {
    mockSocketService = {
      liveHistory: signal([
        {
          schemaId: 'test-schema',
          payload: { foo: 'bar' },
          response: { status: 'ok' },
          timestamp: 1000,
        },
        {
          schemaId: 'another-schema',
          payload: { x: 1 },
          response: { y: 2 },
          timestamp: 2000,
        },
      ]),
    };

    await TestBed.configureTestingModule({
      imports: [LiveHubComponent],
      providers: [{ provide: SocketService, useValue: mockSocketService }],
    }).compileComponents();

    fixture = TestBed.createComponent(LiveHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute available schemas correctly', () => {
    const schemas = component['availableSchemas']();
    expect(schemas).toContain('test-schema');
    expect(schemas).toContain('another-schema');
    expect(schemas.length).toBe(2);
  });

  it('should filter history by selected schema', () => {
    component.toggleSchemaFilter('test-schema');
    fixture.detectChanges();

    const filtered = component['filteredHistory']();
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.schemaId).toBe('test-schema');
  });

  it('should sort history based on sortOrder', () => {
    // Default is desc (latest first)
    let filtered = component['filteredHistory']();
    expect(filtered[0]?.timestamp).toBe(2000);

    component['sortOrder'].set('asc');
    fixture.detectChanges();

    filtered = component['filteredHistory']();
    expect(filtered[0]?.timestamp).toBe(1000);
  });

  it('should toggle maximized state', () => {
    expect(component['isMaximized']()).toBeFalsy();
    component['isMaximized'].set(true);
    expect(component['isMaximized']()).toBeTruthy();
  });

  it('should clear filters', () => {
    component.toggleSchemaFilter('test-schema');
    expect(component['selectedSchemas']().size).toBe(1);

    component.clearFilters();
    expect(component['selectedSchemas']().size).toBe(0);
  });
});
