import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PredavanjeSelectComponent } from './predavanje-select.component';

describe('PredavanjeSelectComponent', () => {
  let component: PredavanjeSelectComponent;
  let fixture: ComponentFixture<PredavanjeSelectComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [PredavanjeSelectComponent]
});
    fixture = TestBed.createComponent(PredavanjeSelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
