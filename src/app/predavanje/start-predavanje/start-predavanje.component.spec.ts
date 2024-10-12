import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StartPredavanjeComponent } from './start-predavanje.component';

describe('StartPredavanjeComponent', () => {
  let component: StartPredavanjeComponent;
  let fixture: ComponentFixture<StartPredavanjeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [StartPredavanjeComponent]
    });
    fixture = TestBed.createComponent(StartPredavanjeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
