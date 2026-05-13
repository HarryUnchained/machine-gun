import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';
import { SelectComponent, type SelectOption } from '../select/select.component';

type CalendarCell = {
  date: Date | null;
  isoKey: string;
  isDisabled: boolean;
};

@Component({
  selector: 'app-datetime-picker',
  imports: [CommonModule, IconComponent, SelectComponent],
  templateUrl: './datetime-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block w-full',
    '(document:click)': 'handleDocumentClick($event)',
    '(document:keydown.escape)': 'closePicker(false)',
  },
})
export class DatetimePickerComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  public readonly value = model<number | undefined>(undefined);
  public readonly min = input<number | undefined>(undefined);
  public readonly max = input<number | undefined>(undefined);
  public readonly placeholder = input('Pick a date and time');
  public readonly displayFormat = input('YYYY-MM-DD HH:mm');
  public readonly showTime = input(true);
  public readonly boundary = input<'start' | 'end'>('start');
  public readonly minuteInterval = input(1);
  public readonly use24Hour = input(true);
  public readonly showCalendarButton = input(true);
  public readonly align = input<'left' | 'right'>('left');

  protected readonly isOpen = signal(false);
  protected readonly visibleMonth = signal(this.startOfMonth(new Date()));
  protected readonly draftDate = signal<Date | null>(null);

  protected readonly selectedDate = computed(() => this.toDate(this.value()));
  protected readonly minDate = computed(() => this.toDate(this.min()));
  protected readonly maxDate = computed(() => this.toDate(this.max()));
  protected readonly displayValue = computed(() => {
    const selectedDate = this.selectedDate();
    if (!selectedDate) {
      return '';
    }

    return this.formatDisplayValue(selectedDate);
  });
  protected readonly monthTitle = computed(() => {
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
    }).format(this.visibleMonth());
  });
  protected readonly weekdayLabels = computed(() => {
    const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    const start = new Date(2026, 0, 4);
    const labels: string[] = [];

    for (let index = 0; index < 7; index++) {
      const labelDate = new Date(start);
      labelDate.setDate(start.getDate() + index);
      labels.push(formatter.format(labelDate));
    }

    return labels;
  });
  protected readonly hourOptions = computed<SelectOption<number>[]>(() => {
    const options: SelectOption<number>[] = [];

    for (let hour = 0; hour < 24; hour++) {
      options.push({
        value: hour,
        label: this.formatHourLabel(hour),
      });
    }

    return options;
  });
  protected readonly minuteOptions = computed<SelectOption<number>[]>(() => {
    const options: SelectOption<number>[] = [];
    const interval = Math.max(1, this.minuteInterval());

    for (let minute = 0; minute < 60; minute += interval) {
      options.push({
        value: minute,
        label: this.padNumber(minute),
      });
    }

    return options;
  });
  protected readonly selectedHour = computed(() => this.draftDate()?.getHours() ?? 0);
  protected readonly selectedMinute = computed(() => this.draftDate()?.getMinutes() ?? 0);
  protected readonly canGoPreviousMonth = computed(() => {
    const minDate = this.minDate();
    if (!minDate) {
      return true;
    }

    const previousMonth = this.addMonths(this.visibleMonth(), -1);
    return this.endOfMonth(previousMonth).getTime() >= minDate.getTime();
  });
  protected readonly canGoNextMonth = computed(() => {
    const maxDate = this.maxDate();
    if (!maxDate) {
      return true;
    }

    const nextMonth = this.addMonths(this.visibleMonth(), 1);
    return this.startOfMonth(nextMonth).getTime() <= maxDate.getTime();
  });
  protected readonly calendarDays = computed<CalendarCell[]>(() => {
    const month = this.visibleMonth();
    const firstDayOfMonth = this.startOfMonth(month);
    const startOffset = firstDayOfMonth.getDay();
    const lastDayOfMonth = this.endOfMonth(month).getDate();
    const totalCellCount = Math.ceil((startOffset + lastDayOfMonth) / 7) * 7;

    const days: CalendarCell[] = [];

    for (let index = 0; index < totalCellCount; index++) {
      const dayOfMonth = index - startOffset + 1;

      if (dayOfMonth < 1 || dayOfMonth > lastDayOfMonth) {
        days.push({
          date: null,
          isoKey: `empty-${month.getFullYear()}-${month.getMonth()}-${index}`,
          isDisabled: true,
        });
        continue;
      }

      const date = new Date(month.getFullYear(), month.getMonth(), dayOfMonth);

      days.push({
        date,
        isoKey: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
        isDisabled: this.isDateDisabled(date),
      });
    }

    return days;
  });

  protected togglePicker() {
    if (this.isOpen()) {
      this.closePicker(false);
      return;
    }

    this.openPicker();
  }

  protected openPicker() {
    const initialDate = this.getInitialDraftDate();
    this.draftDate.set(initialDate);
    this.visibleMonth.set(this.startOfMonth(initialDate));
    this.isOpen.set(true);
  }

  protected closePicker(shouldApply: boolean) {
    if (shouldApply) {
      const draftDate = this.draftDate();
      this.value.set(draftDate ? this.normalizeOutputDate(draftDate).getTime() : undefined);
    }

    this.isOpen.set(false);
  }

  protected clearValue(event?: MouseEvent) {
    event?.stopPropagation();
    this.value.set(undefined);
    this.draftDate.set(null);
    this.isOpen.set(false);
  }

  protected goToPreviousMonth() {
    if (!this.canGoPreviousMonth()) {
      return;
    }

    this.visibleMonth.set(this.addMonths(this.visibleMonth(), -1));
  }

  protected goToNextMonth() {
    if (!this.canGoNextMonth()) {
      return;
    }

    this.visibleMonth.set(this.addMonths(this.visibleMonth(), 1));
  }

  protected selectDay(day: CalendarCell) {
    if (day.isDisabled || !day.date) {
      return;
    }

    const currentDraft = this.draftDate() ?? this.getInitialDraftDate();
    const nextDate = new Date(day.date);
    nextDate.setHours(currentDraft.getHours(), currentDraft.getMinutes(), 0, 0);

    this.draftDate.set(this.clampDate(nextDate));
    this.visibleMonth.set(this.startOfMonth(day.date));
  }

  protected updateHour(hour: number) {
    const currentDraft = this.draftDate() ?? this.getInitialDraftDate();
    const nextDate = new Date(currentDraft);
    nextDate.setHours(hour, nextDate.getMinutes(), 0, 0);
    this.draftDate.set(this.clampDate(nextDate));
  }

  protected updateMinute(minute: number) {
    const currentDraft = this.draftDate() ?? this.getInitialDraftDate();
    const nextDate = new Date(currentDraft);
    nextDate.setMinutes(minute, 0, 0);
    this.draftDate.set(this.clampDate(nextDate));
  }

  protected isSelectedDay(day: CalendarCell): boolean {
    const draftDate = this.draftDate();
    if (!draftDate || !day.date) {
      return false;
    }

    return this.isSameDay(draftDate, day.date);
  }

  protected isToday(day: CalendarCell): boolean {
    if (!day.date) {
      return false;
    }

    return this.isSameDay(new Date(), day.date);
  }

  protected trackDay(_index: number, day: CalendarCell): string {
    return day.isoKey;
  }

  protected handleDocumentClick(event: MouseEvent) {
    if (!this.isOpen()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    const hostEl = this.elementRef.nativeElement as HTMLElement;
    if (!hostEl.contains(target)) {
      this.closePicker(false);
    }
  }

  private getInitialDraftDate(): Date {
    const selectedDate = this.selectedDate();
    if (selectedDate) {
      return new Date(selectedDate);
    }

    return this.getDefaultDraftDate();
  }

  private formatDisplayValue(date: Date): string {
    if (!this.showTime()) {
      return `${date.getFullYear()}-${this.padNumber(date.getMonth() + 1)}-${this.padNumber(
        date.getDate(),
      )}`;
    }

    if (this.displayFormat() === 'YYYY-MM-DD HH:mm') {
      return `${date.getFullYear()}-${this.padNumber(date.getMonth() + 1)}-${this.padNumber(
        date.getDate(),
      )} ${this.padNumber(date.getHours())}:${this.padNumber(date.getMinutes())}`;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: !this.use24Hour(),
    }).format(date);
  }

  private formatHourLabel(hour: number): string {
    if (this.use24Hour()) {
      return this.padNumber(hour);
    }

    const suffix = hour >= 12 ? 'PM' : 'AM';
    const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${normalizedHour} ${suffix}`;
  }

  private padNumber(value: number): string {
    return String(value).padStart(2, '0');
  }

  private clampDate(date: Date): Date {
    const minDate = this.minDate();
    if (minDate && date.getTime() < minDate.getTime()) {
      return new Date(minDate);
    }

    const maxDate = this.maxDate();
    if (maxDate && date.getTime() > maxDate.getTime()) {
      return new Date(maxDate);
    }

    return this.roundToMinuteInterval(date);
  }

  private normalizeOutputDate(date: Date): Date {
    if (this.showTime()) {
      return new Date(date);
    }

    const normalizedDate = new Date(date);

    if (this.boundary() === 'end') {
      normalizedDate.setHours(23, 59, 59, 999);
      return normalizedDate;
    }

    normalizedDate.setHours(0, 0, 0, 0);
    return normalizedDate;
  }

  private roundToMinuteInterval(date: Date): Date {
    const interval = Math.max(1, this.minuteInterval());
    const roundedDate = new Date(date);
    const minute = roundedDate.getMinutes();
    const roundedMinute = Math.round(minute / interval) * interval;

    roundedDate.setSeconds(0, 0);

    if (roundedMinute >= 60) {
      roundedDate.setHours(roundedDate.getHours() + 1, 0, 0, 0);
      return roundedDate;
    }

    roundedDate.setMinutes(roundedMinute, 0, 0);
    return roundedDate;
  }

  private toDate(timestamp?: number): Date | null {
    const normalizedTimestamp = this.normalizeTimestamp(timestamp);
    if (normalizedTimestamp === null) {
      return null;
    }

    const date = new Date(normalizedTimestamp);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  private getDefaultDraftDate(): Date {
    const currentDate = this.roundToMinuteInterval(new Date());
    const minDate = this.minDate();
    const maxDate = this.maxDate();

    if (minDate && currentDate.getTime() < minDate.getTime()) {
      return this.roundToMinuteInterval(new Date(minDate));
    }

    if (maxDate && currentDate.getTime() > maxDate.getTime()) {
      return this.roundToMinuteInterval(new Date(maxDate));
    }

    return currentDate;
  }

  private normalizeTimestamp(timestamp?: number): number | null {
    if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp <= 0) {
      return null;
    }

    if (timestamp < 100_000_000_000) {
      return timestamp * 1000;
    }

    return timestamp;
  }

  private isDateDisabled(date: Date): boolean {
    const minDate = this.minDate();
    if (minDate && this.endOfDay(date).getTime() < minDate.getTime()) {
      return true;
    }

    const maxDate = this.maxDate();
    if (maxDate && this.startOfDay(date).getTime() > maxDate.getTime()) {
      return true;
    }

    return false;
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  private addMonths(date: Date, offset: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + offset, 1);
  }

  private isSameDay(left: Date, right: Date): boolean {
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }
}
