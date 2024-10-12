import { TestBed } from '@angular/core/testing';

import { PredavanjeService } from './predavanje.service';

describe('PredavanjeService', () => {
  let service: PredavanjeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PredavanjeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
