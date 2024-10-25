import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PredavanjeListComponent } from './predavanje-list.component';

describe('PredavanjeListComponent', () => {
  let component: PredavanjeListComponent;
  let fixture: ComponentFixture<PredavanjeListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PredavanjeListComponent]
    });
    fixture = TestBed.createComponent(PredavanjeListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
