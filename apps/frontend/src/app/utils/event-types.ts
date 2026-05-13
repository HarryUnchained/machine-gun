export interface TypedEventTarget<T extends HTMLElement> extends Event {
  readonly target: T;
}

export type InputEvent = TypedEventTarget<HTMLInputElement>;
export type SelectEvent = TypedEventTarget<HTMLSelectElement>;
export type TextAreaEvent = TypedEventTarget<HTMLTextAreaElement>;

export function asInput(event: Event): HTMLInputElement {
  return event.target as HTMLInputElement;
}

export function asSelect(event: Event): HTMLSelectElement {
  return event.target as HTMLSelectElement;
}

export function asCheckbox(event: Event): HTMLInputElement {
  return event.target as HTMLInputElement;
}
