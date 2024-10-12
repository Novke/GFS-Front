import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LivePredavanjeComponent } from './live-predavanje.component';

describe('LivePredavanjeComponent', () => {
  let component: LivePredavanjeComponent;
  let fixture: ComponentFixture<LivePredavanjeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [LivePredavanjeComponent]
    });
    fixture = TestBed.createComponent(LivePredavanjeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
