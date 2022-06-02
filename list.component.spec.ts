import { PRIVATE_PATHS } from "@private/private-routing-constants";
import { RouterTestingModule } from "@angular/router/testing";
import { ButtonComponent } from "@shared/button/button.component";
import { FeatureFlagServiceMock } from "@fixtures/feature-flag.fixtures.spec";
import { CatalogManagerApiService } from "@api/catalog-manager/catalog-manager-api.service";
import {
  MOCK_SUBSCRIPTION_SLOTS,
  MOCK_SUBSCRIPTION_SLOT_CARS,
} from "@fixtures/subscription-slots.fixtures.spec";
import { ListingLimitService } from "@core/subscriptions/listing-limit/listing-limit.service";
import { ListingLimitServiceMock } from "@fixtures/private/pros/listing-limit.fixtures.spec";
import { ProModalComponent } from "@shared/modals/pro-modal/pro-modal.component";
import { MeApiService } from "@api/me/me-api.service";
import { BUMPS_PATHS } from "@private/features/bumps/bumps-routing-constants";
import { CatalogItemTrackingEventService } from "../../core/services/catalog-item-tracking-event.service";
import { VisibilityApiService } from "@api/visibility/visibility-api.service";
import { EmptyStateComponentStub } from "@fixtures/shared/components/empty-state.component.stub";

describe("ListComponent", () => {
  let component: ListComponent;
  let fixture: ComponentFixture<ListComponent>;

  const prosButtonSelector = ".List__button--pros";
  const deliveryButtonSelector = ".List__button--delivery";
  const walletButtonSelector = ".List__button--wallet";

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [HttpModule],
      declarations: [
        ListComponent,
        ItemSoldDirective,
        SubscriptionsSlotsListComponent,
        SubscriptionsSlotItemComponent,
        TryProSlotComponent,
        ProBadgeComponent,
        ButtonComponent,
        EmptyStateComponentStub,
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe("ngOnInit", () => {
    it("should reset page on router event", fakeAsync(() => {
      spyOn<any>(component, "getItems");
      component["nextPage"] = "40";
      component.end = true;
      component.ngOnInit();
      tick();
      router.navigate([""]);
      tick();
      expect(component.scrollTop).toBe(0);
      expect(component["nextPage"]).toBe(null);
      expect(component.end).toBeFalsy();
      expect(component["getItems"]).toHaveBeenCalledTimes(2);
    }));
  });

  describe("when clicking the button", () => {
    it("should open modal", () => {
      component.openModal();

      expect(component.modalOpened).toBe(true);
    });
  });
});
