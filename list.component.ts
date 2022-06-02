import { ConfirmationModalComponent } from "@core/confirmation-modal/confirmation-modal.component";
import { ProModalComponent } from "@core/modals/pro-modal/pro-modal.component";
import { ItemSoldDirective } from "@shared/modals/sold-modal/item-sold.directive";
import { NavLink } from "@shared/nav-links/nav-link.interface";
import { find, findIndex } from "lodash-es";
import { NgxPermissionsService } from "ngx-permissions";
import { Subscription } from "rxjs";
import { take, takeWhile } from "rxjs/operators";
import { STATUS } from "../../../../../../../../../../components/selected-items/selected-product.interface";
import {
  ItemChangeEvent,
  ITEM_CHANGE_ACTION,
} from "../../../../../../../../../../core/item-change.interface";

export const SORTS: ISort[] = [
  {
    value: SORT_KEYS.DATE_DESC,
    label: `Date: from recent to old`,
  },
  {
    value: SORT_KEYS.DATE_ASC,
    label: `Date: from old to recent`,
  },
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
  @ViewChild(ItemSoldDirective, { static: true }) soldButton: ItemSoldDirective;
  @ViewChild(BumpTutorialComponent, { static: true })
  bumpTutorial: BumpTutorialComponent;
  public items: Item[] = [];
  public selectedStatus: STATUS = STATUS.PUBLISHED;
  public loading = true;
  public end: boolean;
  public subscriptionSelectedNavLinks: NavLink[] = [];
  public user: User;
  public userScore: number;
  public showTryProSlot: boolean;
  public hasTrialAvailable: boolean;
  public readonly PERMISSIONS = PERMISSIONS;
  public tierWithDiscount: Tier;
  public prosPath: string = `/${PRO_PATHS.PRO_MANAGER}`;
  public deliveryPath: string = `/${PRIVATE_PATHS.DELIVERY}`;
  public walletPath: string = `/${PRIVATE_PATHS.WALLET}`;
  public emptyStateProperties: EmptyStateProperties;
  private emptyStatePublishedItemsProperties: EmptyStateProperties = {
    title: `Nothing for sale yet`,
    description: `Believe us, it's muuuch better when you sell things. Upload something you want to sell!`,
    illustrationSrc: "/assets/images/commons/pop-no-items.svg",
  };
  private emptyStateSoldItemsProperties: EmptyStateProperties = {
    title: `No finished sales yet`,
    description: `If you want to sell something, just upload it. If you do it with love, so much the better!`,
    illustrationSrc: "/assets/images/commons/pop-nothing-sold.svg",
  };
  private emptyStateInactiveItemsProperties: EmptyStateProperties = {
    title: `No inactive items yet`,
    description: `We encourage you to keep listing items and get the most out of Wallapop. Go go go!`,
    illustrationSrc: "/assets/images/commons/pop-no-items.svg",
  };
  private active = true;
  private firstItemLoad = true;
  private nextPage: string;
  private counters: Counters;
  private searchTerm: string;
  private page = 1;
  private pageSize = 20;
  private subscriptions: SubscriptionsResponse[];
  private componentSubscriptions: Subscription[] = [];

  constructor(
    public itemService: ItemService,
    private modalService: NgbModal,
    private route: ActivatedRoute,
    private paymentService: PaymentService,
    private errorService: ErrorsService,
    private router: Router,
    public userService: UserService,
    private eventService: EventService,
    protected i18n: I18nService
  ) {}

  ngOnInit() {
    this.getUserInfo();
    (window as any).isCmp = false;
    this.subscriptionSelectedNavLinks = [
      {
        id: STATUS.ACTIVE,
        display: this.i18n.translate(TRANSLATION_KEY.ACTIVE),
      },
      {
        id: STATUS.INACTIVE,
        display: this.i18n.translate(TRANSLATION_KEY.INACTIVE),
      },
      { id: STATUS.SOLD, display: this.i18n.translate(TRANSLATION_KEY.SOLD) },
    ];

    this.activateNormalLinks();
    this.setSortItems();

    this.getItems();

    this.catalogManagerService
      .getSlots(this.user.id)
      .subscribe((subscriptionSlots) => {
        this.setSubscriptionSlots(subscriptionSlots);
      });
    this.changeEmptyStateProps();
    this.subscriptionsService
      .getSubscriptions()
      .pipe(take(1))
      .subscribe((subscriptions) => {
        if (subscriptions) {
          this.hasTrialAvailable =
            this.subscriptionsService.hasOneTrialSubscription(subscriptions);
          this.tierWithDiscount =
            this.subscriptionsService.getDefaultTierSubscriptionDiscount(
              subscriptions
            );
          this.subscriptions = subscriptions;
          this.initTryProSlot();
        }
      });

    setTimeout(() => {
      this.router.events.pipe(takeWhile(() => this.active)).subscribe((evt) => {
        if (!(evt instanceof NavigationEnd)) {
          return;
        }
      });
      this.route.params.subscribe((params: any) => {
        if (params && params.updated) {
          this.errorService.i18nSuccess(TRANSLATION_KEY.ITEM_UPDATED);
        } else if (params && params.createdOnHold) {
          const type = params.onHoldType
            ? parseInt(params.onHoldType, 10)
            : SUBSCRIPTION_TYPES.stripe;
          this.listingLimitService.showModal(params.itemId, type);
        } else if (params && params.sold && params.itemId) {
          this.itemService.get(params.itemId).subscribe((item: Item) => {
            this.soldButton.item = item;
            this.soldButton.onClick();
            this.soldButton.callback.subscribe(() => {
              this.itemChanged({
                item: item,
                action: ITEM_CHANGE_ACTION.SOLD,
              });
              this.eventService.emit(EventService.ITEM_SOLD, item);
            });
          });
        } else if (params && params.alreadyFeatured) {
          this.errorService.i18nError(TRANSLATION_KEY.ALREADY_FEATURED_ERROR);
        }
      });
    });
  }

  public onAction(actionType: string, itemId?: string) {
    if (actionType === "activate") {
      this.subscriptionsService.getUserSubscriptionType().subscribe((type) => {
        this.activate(type, itemId);
      });
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

    modalRef.componentInstance.properties = {
      title: this.i18nService.translate(TRANSLATION_KEY.DELETE_ITEMS_TITLE),
      description: this.i18nService.translate(
        TRANSLATION_KEY.DELETE_ITEMS_DESCRIPTION
      ),
      confirmMessage: this.i18nService.translate(TRANSLATION_KEY.DELETE_BUTTON),
      confirmColor: COLORS.NEGATIVE_MAIN,
    };

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
      () => {}
    );
  }

  public reserve() {
    this.itemService.bulkReserve().subscribe((response: ItemBulkResponse) => {
      this.deselect();
      response.updatedIds.forEach((id: string) => {
        const index: number = findIndex(this.items, { id: id });
        if (this.items[index]) {
          this.items[index].reserved = true;
          this.eventService.emit(EventService.ITEM_RESERVED, this.items[index]);
        }
      });
      if (response.failedIds.length) {
        this.errorService.i18nError(TRANSLATION_KEY.BULK_RESERVE_ERROR);
      }
    });
  }

  public deactivate() {
    const items = this.itemService.selectedItems;
    this.modalService.open(DeactivateItemsModalComponent).result.then(() => {
      this.itemService.deactivate().subscribe(() => {
        items.forEach((id: string) => {
          let item: Item = find(this.items, { id: id });
          item.flags[STATUS.ONHOLD] = true;
          item.selected = false;

          const itemIndex = this.items.indexOf(item);
          this.items.splice(itemIndex, 1);
        });
        this.getNumberOfProducts();
        this.updateCountersWhenDeactivate(items.length);
        this.eventService.emit("itemChanged");
      });
    });
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
      this.searchTerm = null;
      this.sortBy = SORTS[0].value;
    } else {
      this.selectedStatus = STATUS.ACTIVE;
    }

    this.updateNavLinks();
    this.getItems();
  }

  public updateNavLinks() {
    if (this.selectedSubscriptionSlot) {
      this.navLinks = this.subscriptionSelectedNavLinks;
    } else {
      this.navLinks = this.normalNavLinks;
      this.resetNavLinksCounters();
    }
  }

  public updateNavLinksCounters() {
    this.navLinks.forEach((navLink) => {
      if (navLink.id === this.selectedStatus) {
        if (this.selectedStatus === STATUS.ACTIVE) {
          navLink.counter = {
            currentVal: this.items.length,
            maxVal: this.selectedSubscriptionSlot.limit,
          };
        } else {
          navLink.counter = { currentVal: this.items.length };
        }
      }
    });
  }

  public getNavLinkById(id: string): NavLink {
    return this.navLinks.filter((navLink) => navLink.id === id)[0];
  }

  public resetNavLinksCounters() {
    this.navLinks.forEach((navLink) => (navLink.counter = null));
  }

  public onSearchInputChange(value: string) {
    this.searchTerm = value;
    this.getItems(null, true);
  }

  public onSortChange(value: any) {
    this.sortBy = value;
    this.getItems(null, true);
  }

  public onCloseTryProSlot(): void {
    this.saveLocalStorage(LOCAL_STORAGE_TRY_PRO_SLOT, "true");
    this.showTryProSlot = false;
  }

  public onClickTryProSlot(): void {
    this.router.navigate([
      `${PRO_PATHS.PRO_MANAGER}/${PRO_PATHS.SUBSCRIPTIONS}`,
    ]);
  }

  public navigateToProsModule(): void {
    this.router.navigate([PRO_PATHS.PRO_MANAGER]);
  }

  private setSortItems(): void {
    this.sortItems = SORTS;
    this.sortBy = SORTS[0].value;
  }

  private changeEmptyStateProps(): void {
    switch (this.selectedStatus) {
      case STATUS.SOLD:
        this.emptyStateProperties = this.emptyStateSoldItemsProperties;
        break;
      case STATUS.PUBLISHED:
        this.emptyStateProperties = this.emptyStatePublishedItemsProperties;
        break;
      case STATUS.INACTIVE:
        this.emptyStateProperties = this.emptyStateInactiveItemsProperties;
        break;
    }
  }

  private setNormalLinks(): void {
    this.normalNavLinks = [
      {
        id: STATUS.PUBLISHED,
        display: this.i18n.translate(TRANSLATION_KEY.PUBLISHED),
      },
      { id: STATUS.SOLD, display: this.i18n.translate(TRANSLATION_KEY.SOLD) },
      {
        id: STATUS.INACTIVE,
        display: this.i18n.translate(TRANSLATION_KEY.INACTIVE),
        counter: { currentVal: this.counters?.onHold },
      },
    ];
  }

  private restoreSelectedItems() {
    this.itemService.selectedItems.forEach((itemId: string) => {
      this.itemService.selectedItems$.next({
        id: itemId,
        action: STATUS.SELECTED,
      });
    });
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
        });
    }
  }

  private reactivationAction(id: string): void {
    const index: number = findIndex(this.items, { id });
    const reactivatedItem = this.items[index];
    reactivatedItem.flags.expired = false;
    reactivatedItem.flags.pending = true;
    if (!this.user.featured) {
      this.reactivatedNoFeaturedUser(reactivatedItem, index);
    } else {
      this.reloadItem(reactivatedItem.id, index);
    }
  }

  private reactivatedNoFeaturedUser(item: Item, index: number): void {
    this.permissionService.permissions$
      .pipe(take(1))
      .subscribe((permissions) => {
        if (
          permissions[PERMISSIONS.subscriptions] &&
          this.shouldShowSuggestProModal()
        ) {
          this.openSuggestProModal(item, index);
        } else {
          this.reloadItem(item.id, index);
        }
      });
  }

  private shouldShowSuggestProModal(): boolean {
    const oneDay = 1000 * 60 * 60 * 24;
    const lastShown = this.userService.getLocalStore(
      LOCAL_STORAGE_SUGGEST_PRO_SHOWN
    );
    return lastShown ? Date.now() - parseInt(lastShown) > oneDay : true;
  }

  private openSuggestProModal(reactivatedItem: Item, index: number): void {
    const isFreeTrial = this.subscriptionsService.hasFreeTrialByCategoryId(
      this.subscriptions,
      reactivatedItem.categoryId
    );
    const tierDiscount = this.subscriptionsService.tierDiscountByCategoryId(
      this.subscriptions,
      reactivatedItem.categoryId
    );
    this.userService.saveLocalStore(
      LOCAL_STORAGE_SUGGEST_PRO_SHOWN,
      Date.now().toString()
    );

    const modalRef = this.modalService.open(ProModalComponent, {
      windowClass: "pro-modal",
    });

    modalRef.componentInstance.modalConfig = this.getProReactivationModalConfig(
      isFreeTrial,
      tierDiscount
    );

    modalRef.result.then(
      (action: MODAL_ACTION) => {
        if (action !== MODAL_ACTION.PRIMARY_BUTTON) {
          this.reloadItem(reactivatedItem.id, index);
        }
      },
      () => this.reloadItem(reactivatedItem.id, index)
    );
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

  private activateNormalLinks(): void {
    this.setNormalLinks();
    this.resetNavLinksCounters();
    this.navLinks = this.normalNavLinks;
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
    itemId: string,
    subscriptionType: SUBSCRIPTION_TYPES
  ): void {
    this.itemService.activateSingleItem(itemId).subscribe(() => {
      this.parseActivation([itemId]);
    });
  }

  private activateMultiItems(subscriptionType: SUBSCRIPTION_TYPES): void {
    const items = this.itemService.selectedItems;
    this.itemService.activate().subscribe(
      () => {
        this.parseActivation(items);
      },
      () => {
        const itemsData: Item[] = [];
        let itemId: string;
        items.forEach((id: string) => {
          let item: Item = find(this.items, { id: id });
          itemsData.push(item);
        });

        if (
          itemsData.every((item) => item.categoryId === itemsData[0].categoryId)
        ) {
          itemId = itemsData[0].id;
        }
        this.listingLimitService.showModal(itemId, subscriptionType);
      }
    );
  }

  private parseActivation(items: string[]): void {
    const activedItems = [];
    items.forEach((id: string) => {
      let item: Item = find(this.items, { id: id });
      activedItems.push(item);
      if (this.selectedStatus === STATUS.INACTIVE) {
        const itemIndex = this.items.indexOf(item);
        this.items.splice(itemIndex, 1);
      } else {
        item.flags[STATUS.ONHOLD] = false;
        item.selected = false;
      }
    });
    this.activationSuccessful(activedItems);
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

    if (!selectedSlot || typeof selectedSlot.available !== "number") {
      return;
    }

    const updatedAvailableSlotVal = (selectedSlot.available -= items.length);
    selectedSlot.available =
      updatedAvailableSlotVal < 0 ? 0 : updatedAvailableSlotVal;
  }

  private updateCountersWhenDeactivate(numDeactivatedItems: number) {
    if (!this.selectedSubscriptionSlot) {
      return;
    }

    if (typeof this.selectedSubscriptionSlot.available === "number") {
      this.selectedSubscriptionSlot.available += numDeactivatedItems;
    }

    const inactiveNavLink = this.getNavLinkById(STATUS.INACTIVE);
    if (inactiveNavLink.counter) {
      inactiveNavLink.counter.currentVal += numDeactivatedItems;
    }

    const activeNavLink = this.getNavLinkById(STATUS.ACTIVE);
    activeNavLink.counter.currentVal -= numDeactivatedItems;
  }

  private setSubscriptionSlots(slots: SubscriptionSlot[]) {
    this.subscriptionSlots = slots;
    this.searchPlaceholder = this.i18n.translate(
      TRANSLATION_KEY.SEARCH_BY_TITLE
    );
    this.setSortItems();
  }

  private getUserInfo() {
    const user = this.userService.user;

    this.user = user;
    this.userService.getInfo(user.id).subscribe((info) => {
      this.userScore = info.scoring_stars;
    });
  }

  private initTryProSlot(): void {
    this.showTryProSlot = this.userService.suggestPro();
  }

  private saveLocalStorage(key: string, value: string): void {
    if (this.user) {
      localStorage.setItem(`${this.user.id}-${key}`, value);
    }
  }
}
