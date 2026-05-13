import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  public readonly token = signal<string>('my-super-secret-key');

  public setToken(token: string): void {
    this.token.set(token);
  }
}
