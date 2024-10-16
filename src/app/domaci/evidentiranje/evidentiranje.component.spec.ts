import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvidentiranjeComponent } from './evidentiranje.component';

describe('EvidentiranjeComponent', () => {
  let component: EvidentiranjeComponent;
  let fixture: ComponentFixture<EvidentiranjeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [EvidentiranjeComponent]
    });
    fixture = TestBed.createComponent(EvidentiranjeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
