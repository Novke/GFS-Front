import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PregledDomacegComponent } from './pregled-domaceg.component';

describe('PregledDomacegComponent', () => {
  let component: PregledDomacegComponent;
  let fixture: ComponentFixture<PregledDomacegComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [PregledDomacegComponent]
});
    fixture = TestBed.createComponent(PregledDomacegComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
