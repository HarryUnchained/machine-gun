import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectComponent, type SelectOption } from './select.component';
import { By } from '@angular/platform-browser';
import { ChangeDetectionStrategy } from '@angular/core';

describe('SelectComponent', () => {
  let component: SelectComponent<string>;
  let fixture: ComponentFixture<SelectComponent<string>>;

  const options: SelectOption<string>[] = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectComponent],
    })
      .overrideComponent(SelectComponent, {
        set: { changeDetection: ChangeDetectionStrategy.Default },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SelectComponent<string>);
    component = fixture.componentInstance;

    // Use the Signal input setters
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', 'option1');

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the selected option label', () => {
    const label = fixture.debugElement.query(By.css('span')).nativeElement.textContent.trim();
    expect(label).toBe('Option 1');
  });

  it('should toggle dropdown on click', () => {
    const button = fixture.debugElement.query(By.css('button'));
    button.triggerEventHandler('click', null);
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);

    button.triggerEventHandler('click', null);
    fixture.detectChanges();

    expect(component.isOpen()).toBe(false);
  });

  it('should emit change when an option is selected', () => {
    const changeSpy = vi.fn();
    component.change.subscribe(changeSpy);

    component.toggle();
    fixture.detectChanges();

    const optionButtons = fixture.debugElement.queryAll(By.css('button[type="button"]'));
    // The first button is the select toggle, the following are options
    const secondOption = optionButtons[2]!; // index 0 is toggle, index 1 is option 1, index 2 is option 2
    secondOption.triggerEventHandler('click', null);
    fixture.detectChanges();

    expect(changeSpy).toHaveBeenCalledWith('option2');
    expect(component.isOpen()).toBe(false);
  });
});
