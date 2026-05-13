import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';
import { beforeEach, describe, expect, it } from 'vitest';

describe('IconComponent', () => {
  let component: IconComponent;
  let fixture: ComponentFixture<IconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(IconComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.componentRef.setInput('name', 'add');
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should map icon names to material symbols', () => {
    fixture.componentRef.setInput('name', 'vertical_align_bottom');
    fixture.detectChanges();
    expect(component['materialSymbolName']()).toBe('vertical_align_bottom');
  });

  it('should handle material fallback for rabbitmq', () => {
    fixture.componentRef.setInput('name', 'rabbitmq');
    fixture.detectChanges();
    expect(component['isCustomIcon']()).toBeFalsy();
    expect(component['materialSymbolName']()).toBe('cruelty_free');
  });

  it('should apply size correctly', () => {
    fixture.componentRef.setInput('name', 'add');
    fixture.componentRef.setInput('size', 32);
    fixture.detectChanges();
    const hostElement = fixture.nativeElement;
    expect(hostElement.style.width).toBe('32px');
  });
});
