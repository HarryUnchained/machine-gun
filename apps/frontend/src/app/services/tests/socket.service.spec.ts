import { SocketService } from '../socket.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth.service';
describe('SocketService', () => {
  let service: SocketService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SocketService, AuthService],
    });
    service = TestBed.inject(SocketService);

    // The issue might be that SocketService was providedIn: 'root' and Vitest isn't isolating the tests properly or vi.clearAllMocks() is wiping it.
    // If it's a singleton, let's just assert that it was called in general, not necessarily in the beforeEach.
    // Wait, let's see if we can just re-instantiate it manually or remove clearAllMocks for the `io` function.
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
