import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestSelectComponent } from './test-select.component';

describe('TestSelectComponent', () => {
  let component: TestSelectComponent;
  let fixture: ComponentFixture<TestSelectComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TestSelectComponent]
    });
    fixture = TestBed.createComponent(TestSelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
