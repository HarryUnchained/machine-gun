import { Injectable } from '@angular/core';
import type { SchemaDefinition } from '@machine-gun/common';

@Injectable({
  providedIn: 'root',
})
export class ImportService {
  public parseJson(file: File): Promise<Partial<SchemaDefinition>> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content) as unknown;

          if (parsed && typeof parsed === 'object') {
            resolve(parsed);
          } else {
            reject(new Error('Invalid schema format. Expected a JSON object.'));
          }
        } catch {
          reject(new Error('Invalid JSON file. Please check for syntax errors.'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file. Please try again.'));
      };

      reader.readAsText(file);
    });
  }
}
