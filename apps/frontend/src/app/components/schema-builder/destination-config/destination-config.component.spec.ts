import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DestinationConfigComponent } from './destination-config.component';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransportType } from '@machine-gun/common';

describe('DestinationConfigComponent', () => {
  let component: DestinationConfigComponent;
  let fixture: ComponentFixture<DestinationConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DestinationConfigComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DestinationConfigComponent);
    component = fixture.componentInstance;

    // Set required inputs using setInput (for signals)
    fixture.componentRef.setInput('destination', {
      transport: TransportType.RABBITMQ,
      targetType: 'exchange',
      target: 'test-exchange',
      routingKey: 'test-key',
      isRpc: false,
      headers: {},
    });
    fixture.componentRef.setInput('isValid', true);
    fixture.componentRef.setInput('rpcResponse', null);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit destinationChange when updated', () => {
    vi.spyOn(component.destinationChange, 'emit');

    component['update']({ target: 'new-exchange' });
    expect(component.destinationChange.emit).toHaveBeenCalled();
  });

  it('should add and remove headers', () => {
    const emitSpy = vi.spyOn(component.destinationChange, 'emit');

    component['addHeader']();
    component['updateHeader'](0, { key: 'x-test', value: '1' });
    expect(emitSpy).toHaveBeenCalledWith({ headers: { 'x-test': '1' } });

    component['removeHeader'](0);
    expect(emitSpy).toHaveBeenCalledWith({ headers: undefined });
  });

  it('should validate RabbitMQ targets correctly', () => {
    fixture.componentRef.setInput('isValid', false);
    fixture.detectChanges();
    expect(component.isValid()).toBeFalsy();

    fixture.componentRef.setInput('isValid', true);
    fixture.detectChanges();
    expect(component.isValid()).toBeTruthy();
  });

  it('should emit a Kafka-friendly patch when switching transport', () => {
    const emitSpy = vi.spyOn(component.destinationChange, 'emit');

    component['updateTransport'](TransportType.KAFKA);

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: TransportType.KAFKA,
        targetType: undefined,
        exchangeType: undefined,
        kafkaKey: { mode: 'none' },
      }),
    );
  });
});
