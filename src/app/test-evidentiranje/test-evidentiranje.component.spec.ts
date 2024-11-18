import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestEvidentiranjeComponent } from './test-evidentiranje.component';

describe('TestEvidentiranjeComponent', () => {
  let component: TestEvidentiranjeComponent;
  let fixture: ComponentFixture<TestEvidentiranjeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TestEvidentiranjeComponent]
    });
    fixture = TestBed.createComponent(TestEvidentiranjeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
