import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowCanvasComponent } from './flow-canvas.component';
import { FlowService } from '../../services/flow.service';
import { SocketService } from '../../services/socket.service';
import { NavigationService } from '../../services/navigation.service';
import { StorageService } from '../../services/storage.service';
import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('FlowCanvasComponent', () => {
  let component: FlowCanvasComponent;
  let fixture: ComponentFixture<FlowCanvasComponent>;
  let mockFlowService: any;
  let mockSocketService: any;
  let mockNavService: any;
  let mockStorageService: any;

  beforeEach(async () => {
    mockFlowService = {
      activeFlow: signal(null),
      availableFlows: signal([]),
      layoutDirection: signal('LR'),
      showDiff: signal(false),
      selectedNodeId: signal(null),
      selectedEdgeId: signal(null),
      showNodeExplorer: signal(false),
      isRightPanelOpen: signal(false),
      showHelp: signal(false),
      autoLayout: vi.fn(),
      updateActiveFlow: vi.fn(),
      addNode: vi.fn(),
    };

    mockSocketService = {
      schemas: signal([]),
      nodeStatuses: signal({}),
      activeFlowIds: signal([]),
      flowNodeActivity: signal({}),
    };

    mockNavService = {
      showLibrary: signal(false),
    };

    mockStorageService = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [FlowCanvasComponent],
      providers: [
        { provide: FlowService, useValue: mockFlowService },
        { provide: SocketService, useValue: mockSocketService },
        { provide: NavigationService, useValue: mockNavService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FlowCanvasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initiate pan on mouse down (left click)', () => {
    const event = new MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 });
    Object.defineProperty(event, 'target', { value: fixture.nativeElement });
    component.onCanvasMouseDown(event);

    expect((component as any).isPanning).toBe(true);
    expect((component as any).lastMousePos.x).toBe(100);
  });

  it('should update zoom on mouse wheel', () => {
    const initialZoom = (component as any).zoom();
    const event = new WheelEvent('wheel', { deltaY: -100, clientX: 500, clientY: 500 }); // Zoom in
    Object.defineProperty(event, 'target', { value: fixture.nativeElement });
    Object.defineProperty(event, 'currentTarget', { value: fixture.nativeElement });

    // We need to mock getBoundingClientRect for the host element
    vi.spyOn(fixture.nativeElement, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
    });

    component.onCanvasWheel(event);

    expect((component as any).zoom() as number).toBeGreaterThan(initialZoom as number);
  });

  it('should call autoLayout and reset view on magicLayout', () => {
    component.magicLayout();

    expect(mockFlowService.autoLayout).toHaveBeenCalled();
    expect((component as any).zoom()).toBe(1);
    expect((component as any).pan().x).toBe(0);
    expect((component as any).pan().y).toBe(0);
  });

  it('should restore canvas state from storage on init', () => {
    // Note: Restoration happens in constructor, so we'd need to re-create or check if it was called
    expect(mockStorageService.get).toHaveBeenCalledWith('canvas_pan');
    expect(mockStorageService.get).toHaveBeenCalledWith('canvas_zoom');
  });
});
