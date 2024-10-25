import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PregledPredavanjaComponent } from './pregled-predavanja.component';

describe('PregledPredavanjaComponent', () => {
  let component: PregledPredavanjaComponent;
  let fixture: ComponentFixture<PregledPredavanjaComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PregledPredavanjaComponent]
    });
    fixture = TestBed.createComponent(PregledPredavanjaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
