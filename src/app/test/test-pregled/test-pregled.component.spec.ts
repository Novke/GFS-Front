import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestPregledComponent } from './test-pregled.component';

describe('TestPregledComponent', () => {
  let component: TestPregledComponent;
  let fixture: ComponentFixture<TestPregledComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TestPregledComponent]
    });
    fixture = TestBed.createComponent(TestPregledComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
