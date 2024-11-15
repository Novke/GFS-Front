import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NovTestComponent } from './nov-test.component';

describe('NovTestComponent', () => {
  let component: NovTestComponent;
  let fixture: ComponentFixture<NovTestComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [NovTestComponent]
    });
    fixture = TestBed.createComponent(NovTestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
