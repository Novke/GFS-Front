import { TestBed } from '@angular/core/testing';

import { DomaciService } from './domaci.service';

describe('DomaciService', () => {
  let service: DomaciService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DomaciService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
