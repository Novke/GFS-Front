import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DomaciSelectComponent } from './domaci-select.component';

describe('DomaciSelectComponent', () => {
  let component: DomaciSelectComponent;
  let fixture: ComponentFixture<DomaciSelectComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DomaciSelectComponent]
    });
    fixture = TestBed.createComponent(DomaciSelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
