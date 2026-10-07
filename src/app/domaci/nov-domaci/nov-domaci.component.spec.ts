import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NovDomaciComponent } from './nov-domaci.component';

describe('NovDomaciComponent', () => {
  let component: NovDomaciComponent;
  let fixture: ComponentFixture<NovDomaciComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [NovDomaciComponent]
});
    fixture = TestBed.createComponent(NovDomaciComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
