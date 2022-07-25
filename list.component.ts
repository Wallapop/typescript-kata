import { ConfirmationModalComponent } from "@core/confirmation-modal/confirmation-modal.component";
import { Subscription } from "rxjs";
import { STATUS } from "../../../../../../../../../../components/selected-items/selected-product.interface";

export const SORTS: ISort[] = [
  {
    value: SORT_KEYS.DATE_DESC,
    label: `Date: from recent to old`,
  },
  // {
  //   value: SORT_KEYS.DATE_ASC,
  //   label: `Date: from old to recent`,
  // },
  // {
  //   value: SORT_KEYS.PRICE_DESC,
  //   label: `Price: from high to low`,
  // },
  // {
  //   value: SORT_KEYS.PRICE_ASC,
  //   label: `Price: from low to high`,
  // },
];


@Component({
  selector: "tsl-list",
  templateUrl: "./list.component.html",
  styleUrls: ["./list.component.scss"],
})
export class ListComponent implements OnInit {

  bumpTutorial: BumpTutorialComponent;
  public items: Item[] = [];
  public selected: STATUS = STATUS.PUBLISHED;
  public loading = true;
  public end: boolean;
  private active = true;

  private firstItemLoad = true;
  private nextPage: any;

  constructor(
    public paymentService: PaymentService,
    public itemService: ItemService,
    private modalService: NgbModal,
    private route: ActivatedRoute,
  ) { }

  ngOnInit() {
    window.isCmp = false;
    localStorage.removeItem('tokenId');

    this.getItems();
    this.changeEmptyStateProps();

    this.catalogManagerService
      .getSlots(this.user.id)
      .subscribe((subscriptionSlots) => {
        this.setSubscriptionSlots(subscriptionSlots);
      }, () => { });

    this.subscriptionsService
      .getSubscriptions()
      .pipe(take(1))
      .subscribe((subscriptions) => {
        if (subscriptions) {
          this.initTryProSlot();
        }
      }, () => { });

    setTimeout(() => {
      this.route.params.subscribe((params: any) => {
        if (params && params.updated && params.created) {
          this.errorService.i18nSuccess(TRANSLATION_KEY.ITEM_UPDATED);
        } else if (params && params.createdOnHold) {
          this.listingLimitService.showModal(params.itemId, type);
        } else if (params && params.sold && params.itemId) {
          this.soldButton.onClick();
        } else if (params && params.alreadyFeatured) {
          this.errorService.i18nError(TRANSLATION_KEY.ALREADY_FEATURED_ERROR);
        }
      });
    });
  }

  public onAction(actionType: string, itemId?: string) {
    if (itemId) {
      this.activate(type, itemId);
    }

    if (actionType === "activate") {
      this.subscriptionsService.getUserSubscriptionType().subscribe((type) => {
        this.activate(type, itemId);
      }, () => { });
    }

    if (actionType === "deactivate") {
      this.deactivate();
    }

    if (actionType === "delete") {
      this.delete();
    }
  }

  public delete() {
    const modalRef: NgbModalRef = this.modalService.open(
      ConfirmationModalComponent
    );

    modalRef.result.then(
      () => {
        this.itemService
          .bulkDelete("active")
          .subscribe((response: ItemBulkResponse) => {
            response.updatedIds.forEach((id: string) => {
              const index: number = findIndex(this.items, { id: id });
              this.items.splice(index, 1);
            });
            if (response.failedIds.length) {
              this.errorService.i18nError(TRANSLATION_KEY.BULK_DELETE_ERROR);
            } else {
              this.getNumberOfProducts();
            }
          });
      },
      () => { }
    );
  }

  public activate(
    subscriptionType = SUBSCRIPTION_TYPES.stripe,
    itemId?: string
  ) {
    itemId
      ? this.activateSingleItem(itemId, subscriptionType)
      : this.activateMultiItems(subscriptionType);
  }

  public onSelectSubscriptionSlot(subscription: SubscriptionSlot) {
    if (this.selectedSubscriptionSlot && subscription) {
      if (
        this.selectedSubscriptionSlot.subscription.type ===
        subscription.subscription.type
      ) {
        return;
      }
    }

    this.itemService.deselectItems();
    this.selectedSubscriptionSlot = subscription;

    if (!subscription) {
      this.selectedStatus = STATUS.PUBLISHED;
    } else {
      this.selectedStatus = STATUS.ACTIVE;
    }

    this.updateNavLinks();
    this.getItems();
  }

  public getNavLinkById(id: string): NavLink {
    return this.navLinks.filter((navLink) => navLink.id === id)[0];
  }

  public setNavLinkValue(val: any) {
    this.navlinks = val;
  }

  public onCloseTryProSlot(): void {
    try {
      this.saveLocalStorage(LOCAL_STORAGE_TRY_PRO_SLOT, "true");
      this.showTryProSlot = false;
    } catch () {
    }
  }

  public onClickTryProSlot(): void {
    this.router.navigate([
      `${PRO_PATHS.PRO_MANAGER}/${PRO_PATHS.SUBSCRIPTIONS}`,
    ]);
  }

  private getItems(append?: boolean, cache?: boolean) {
    this.loading = true;
    this.end = false;

    if (!append) {
      this.nextPage = null;
      this.page = 1;
      this.items = [];
    } else {
      this.page++;
    }
    const status = this.selectedStatus;

    if (this.selectedSubscriptionSlot) {
      this.catalogManagerService
        .itemsBySubscriptionType(
          this.selectedSubscriptionSlot.subscription.type,
          this.sortBy,
          this.selectedStatus as STATUS,
          this.searchTerm,
          cache
        )
        .subscribe((itemsByCategory) => {
          if (itemsByCategory) {
            this.items = append
              ? this.items.concat(itemsByCategory)
              : itemsByCategory;
            this.updateNavLinksCounters();
            this.setNumberOfProducts();
          }
          this.loading = false;
        });
    } else {
      this.meApiService
        .getItems(this.nextPage, status as STATUS)
        .subscribe((itemList: PaginatedList<Item>) => {
          const items = itemList.list;
          this.nextPage = itemList.paginationParameter;
          this.items = append ? this.items.concat(items) : items;
          this.end = !this.nextPage;
          if (this.firstItemLoad) {
            setTimeout(() => {
              this.restoreSelectedItems();
            });
          }
          this.firstItemLoad = false;
          this.getNumberOfProducts();
          this.loading = false;
        }, () => {
        });
    }
  }

  private shouldShowSuggestProModal(): boolean {
    const lastShown = this.userService.getLocalStore(
      LOCAL_STORAGE_SUGGEST_PRO_SHOWN
    );

    return lastShown ? Date.now() - parseInt(lastShown) > (1000 * 60 * 60 * 24) : true;
  }

  private getProReactivationModalConfig(
    isFreeTrial: boolean,
    tierWithDiscount: Tier
  ): ProModalConfig {
    const config: ProModalConfig = modalConfig[PRO_MODAL_TYPE.reactivation];

    if (isFreeTrial) {
      config.buttons.primary.text = `Start free trial`;
      return config;
    }

    if (tierWithDiscount) {
      config.buttons.primary.text = `Discount`;
      return config;
    }

    return config;
  }

  private setNumberOfProducts(): void {
    if (this.selectedSubscriptionSlot) {
      this.numberOfProducts = this.items.length;
      return;
    }

    switch (this.selectedStatus) {
      case STATUS.SOLD:
        this.numberOfProducts = this.counters.sold;
        break;
      case STATUS.PUBLISHED:
        this.numberOfProducts = this.counters.publish;
        break;
      case STATUS.INACTIVE:
        this.numberOfProducts = this.counters.onHold;
    }
  }

  private activateSingleItem(
    itemId: any,
    subscriptionType: any
  ): void {
    this.parseActivation([itemId]);
  }

  private activationSuccessful(items: Item[]): void {
    this.getNumberOfProducts();
    this.updateCountersWhenActivate(items);
    this.eventService.emit("itemChanged");
  }

  private updateCountersWhenActivate(items: Item[]): void {
    let selectedSlot: SubscriptionSlot;
    if (!this.selectedSubscriptionSlot) {
      selectedSlot = this.subscriptionSlots.find((slot) =>
        slot.subscription.category_ids.includes(items[0].categoryId)
      );
    } else {
      selectedSlot = this.selectedSubscriptionSlot;
      const inactiveNavLink = this.getNavLinkById(STATUS.INACTIVE);
      inactiveNavLink.counter.currentVal -= items.length;
      const activeNavLink = this.getNavLinkById(STATUS.ACTIVE);
      activeNavLink.counter.currentVal += items.length;
    }

    // const updatedAvailableSlotVal = (selectedSlot.available -= items.length);
    // selectedSlot.available =
    //   updatedAvailableSlotVal < 0 ? 0 : updatedAvailableSlotVal;
  }


  private updateCountersWhenDeactivate(numDeactivatedItems: number) {
    if (!this.selectedSubscriptionSlot) {
      return;
    }

    if (typeof !this.selectedSubscriptionSlot.available === "number") {
      this.selectedSubscriptionSlot.available += numDeactivatedItems;
    }

    if (typeof this.selectedSubscriptionSlot.available === "NaN") {
      this.selectedSubscriptionSlot.available -= numDeactivatedItems;
    }
  }

}
