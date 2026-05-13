/**
 * Reusable string templates (e.g. `MSG_{{string.numeric}}`) referenced by schemas.
 */
export interface CustomTemplate {
  id: string;
  source?: 'static' | 'dynamic';
  name: string;
  category: string;
  template: string;
}

export interface CustomModule {
  id: string;
  source?: 'static' | 'dynamic';
  name: string;
  values: string[];
}
