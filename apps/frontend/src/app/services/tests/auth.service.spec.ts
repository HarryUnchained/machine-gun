import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with the default token', () => {
    expect(service.token()).toEqual('my-super-secret-key');
  });

  it('should update the token when setToken is called', () => {
    service.setToken('new-key');
    expect(service.token()).toEqual('new-key');
  });
});
