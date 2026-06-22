import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WebsocketService } from '../../../../core/services/websocket.service';
import { Station, Order, PTLSession } from '../../../../core/models';
import { PtlBoardComponent } from '../ptl-board/ptl-board.component';

export type ViewMode = 'station' | 'scan' | 'board';

@Component({
  selector: 'app-station-view',
  templateUrl: './station-view.component.html',
  styleUrls: ['./station-view.component.scss'],
})
export class StationViewComponent implements OnInit, OnDestroy {
  @ViewChild(PtlBoardComponent) boardRef?: PtlBoardComponent;

  // ── Step tracking ─────────────────────────────────────────
  viewMode: ViewMode = 'station';

  // ── Step 1: Station selection ─────────────────────────────
  stations:        Station[]    = [];
  selectedStation: Station | null = null;
  stationsLoading  = true;

  // ── Step 2: Scan screen ───────────────────────────────────
  scanInputValue   = '';
  scanLoading      = false;
  scanError        = '';
  activeSessions:  PTLSession[] = [];
  pendingOrders:   Order[]      = [];

  // ── Step 3: Board ─────────────────────────────────────────
  activeOrder:  Order | null = null;
  confirming    = false;
  fullscreen    = false;

  operatorId: number | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private api:    ApiService,
    private notify: NotificationService,
    private ws:     WebsocketService,
  ) {}

  ngOnInit(): void {
    this.loadStations();

    interval(20000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadStations();
      if (this.viewMode === 'scan') {
        this.loadActiveSessions();
        this.loadPendingOrders();
      }
    });

    this.ws.on('BIN_ACTIVATED').pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadStations();
      this.loadActiveSessions();
    });

    this.ws.on('BIN_DEACTIVATED').pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadStations();
      this.loadActiveSessions();
      this.loadPendingOrders();
    });

    this.ws.on('ITEM_CONFIRMED').pipe(takeUntil(this.destroy$)).subscribe((msg: any) => {
      if (this.activeOrder?.OrderID === msg.data?.orderId) {
        this.reloadActiveOrder();
      }
    });

    this.ws.on('ORDER_COMPLETED').pipe(takeUntil(this.destroy$)).subscribe((msg: any) => {
      if (this.activeOrder?.OrderID === msg.data?.orderId) {
        this.notify.success(`Order ${msg.data?.orderNumber} completed!`);
        this.clearActiveOrder();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // STEP 1 — Station selection
  // ════════════════════════════════════════════════════════════
  loadStations(): void {
    this.api.getStations().subscribe({
      next: (r) => {
        this.stations = r.data;
        this.stationsLoading = false;
      },
      error: () => { this.stationsLoading = false; },
    });
  }

  selectStation(station: Station): void {
    this.selectedStation = station;
    this.viewMode        = 'scan';
    this.scanInputValue  = '';
    this.scanError       = '';
    this.loadActiveSessions();
    this.loadPendingOrders();
  }

  stationStatus(s: Station): 'available' | 'full' | 'inactive' {
    if (!s.IsActive) return 'inactive';
    return (s.FreeBins ?? 0) > 0 ? 'available' : 'full';
  }

  occupancy(s: Station): number {
    const total = s.TotalBins ?? 1;
    return Math.round(((s.ActiveBins ?? 0) / total) * 100);
  }

  // ════════════════════════════════════════════════════════════
  // STEP 2 — Scan / order lookup
  // ════════════════════════════════════════════════════════════
  loadActiveSessions(): void {
    this.api.getActiveSessions().subscribe((r) => {
      // Show all sessions but filter to selected station if one is chosen
      this.activeSessions = this.selectedStation
        ? r.data.filter((s: PTLSession) => s.StationID === this.selectedStation!.StationID)
        : r.data;
    });
  }

  loadPendingOrders(): void {
    this.api.getOrders({ status: 'Pending', limit: 20 }).subscribe((r) => {
      this.pendingOrders = r.data;
    });
  }

  startByInput(): void {
    const raw = this.scanInputValue.trim();
    if (!raw || this.scanLoading) return;

    // Extract order number from QR formats
    let search = raw;
    if (raw.toUpperCase().startsWith('GTP|') || raw.toUpperCase().startsWith('GTP-ORDER|')) {
      search = raw.split('|')[1] || raw;
    }

    this.scanError   = '';
    this.scanLoading = true;

    this.api.getOrders({ search, limit: 5 }).subscribe({
      next: (r) => {
        const orders = r.data;
        if (!orders?.length) {
          this.scanError   = `No order found for "${search}"`;
          this.scanLoading = false;
          return;
        }

        const exact = orders.find(
          (o: Order) => o.OrderNumber.toUpperCase() === search.toUpperCase(),
        );
        const order = exact || orders[0];

        if (order.Status === 'InProgress' || order.Status === 'Assigned') {
          this.openOrderById(order.OrderID);
          this.scanLoading    = false;
          this.scanInputValue = '';
        } else if (order.Status === 'Pending') {
          this.startPendingOrder(order);
        } else {
          this.scanError   = `Order is "${order.Status}" — cannot start`;
          this.scanLoading = false;
        }
      },
      error: (err) => {
        this.scanError   = err.error?.message || 'Lookup failed';
        this.scanLoading = false;
      },
    });
  }

  openSession(session: PTLSession): void {
    this.api.getOrder(session.OrderID).subscribe((r) => {
      this.activeOrder = r.data;
      this.viewMode    = 'board';
      this.scanError   = '';
    });
  }

  openOrderById(orderId: number): void {
    this.api.getOrder(orderId).subscribe((r) => {
      this.activeOrder    = r.data;
      this.viewMode       = 'board';
      this.scanInputValue = '';
      this.scanError      = '';
    });
  }

  startPendingOrder(order: Order): void {
    this.scanLoading = true;
    this.api
      .startOrder(order.OrderID, this.operatorId ?? undefined, this.selectedStation?.StationID ?? undefined)
      .subscribe({
        next: (r) => {
          this.scanLoading    = false;
          this.scanInputValue = '';
          this.activeOrder    = { ...order, ...r.data.order, items: r.data.items };
          this.viewMode       = 'board';
          this.loadActiveSessions();
          this.loadPendingOrders();
          this.loadStations();
        },
        error: (err) => {
          this.scanLoading = false;
          this.scanError   = err.error?.message || 'Cannot start order';
        },
      });
  }

  // ════════════════════════════════════════════════════════════
  // STEP 3 — Board actions
  // ════════════════════════════════════════════════════════════
  confirmCurrentItem(): void {
    if (!this.activeOrder || this.confirming) return;

    const item = this.activeOrder.items?.find(
      (i) => i.Status !== 'Completed' && i.Status !== 'Skipped',
    );
    if (!item) return;

    this.confirming = true;
    this.api
      .confirmItem(this.activeOrder.OrderID, item.ItemID, undefined, this.operatorId ?? undefined)
      .subscribe({
        next: () => {
          this.boardRef?.triggerConfirmAnim();
          this.confirming = false;
          this.reloadActiveOrder();
        },
        error: (err) => {
          this.confirming = false;
          this.notify.error(err.error?.message || 'Confirm failed');
        },
      });
  }

  reloadActiveOrder(): void {
    if (!this.activeOrder) return;
    this.api.getOrder(this.activeOrder.OrderID).subscribe((r) => {
      this.activeOrder = r.data;
    });
  }

  forceComplete(): void {
    if (!this.activeOrder || !confirm('Complete this order?')) return;
    this.api.completeOrder(this.activeOrder.OrderID, this.operatorId ?? undefined).subscribe({
      next: () => { this.notify.success('Order completed'); this.clearActiveOrder(); },
      error: (err) => this.notify.error(err.error?.message || 'Failed'),
    });
  }

  cancelActiveOrder(): void {
    if (!this.activeOrder || !confirm('Cancel this order?')) return;
    this.api.cancelPTL(this.activeOrder.OrderID, this.operatorId ?? undefined).subscribe({
      next: () => { this.notify.success('Order cancelled'); this.clearActiveOrder(); },
      error: (err) => this.notify.error(err.error?.message || 'Failed'),
    });
  }

  exitBoard(): void {
    if (this.activeOrder && !confirm('Leave this order? It will remain active.')) return;
    this.activeOrder = null;
    this.viewMode    = 'scan';
  }

  clearActiveOrder(): void {
    this.activeOrder = null;
    this.viewMode    = 'scan';
    this.loadActiveSessions();
    this.loadPendingOrders();
    this.loadStations();
  }

  backToStations(): void {
    this.selectedStation = null;
    this.viewMode        = 'station';
    this.scanInputValue  = '';
    this.scanError       = '';
  }

  toggleFullscreen(): void { this.fullscreen = !this.fullscreen; }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
