import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  public get<T>(key: string): T | null {
    const data = localStorage.getItem(key);
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  }

  public set<T>(key: string, value: T): void {
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  public remove(key: string): void {
    localStorage.removeItem(key);
  }

  public clear(): void {
    localStorage.clear();
  }
}
