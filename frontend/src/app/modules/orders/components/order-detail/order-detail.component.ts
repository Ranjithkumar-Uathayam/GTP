import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WebsocketService } from '../../../../core/services/websocket.service';
import { Order } from '../../../../core/models';

@Component({
  selector: 'app-order-detail',
  templateUrl: './order-detail.component.html',
  styleUrls: ['./order-detail.component.scss'],
})
export class OrderDetailComponent implements OnInit, OnDestroy {
  order: Order | null = null;
  eventLog: any[] = [];
  loading = true;
  itemCols = ['SortSeq','ItemCode','ItemName','RequiredQty','PutQty','Status'];
  eventCols = ['EventType','ItemCode','Quantity','OperatorName','EventTime'];
  private destroy$ = new Subject<void>();

  constructor(
    private route:  ActivatedRoute,
    private router: Router,
    private api:    ApiService,
    private notify: NotificationService,
    private ws:     WebsocketService,
  ) {}

  ngOnInit(): void {
    const id = parseInt(this.route.snapshot.paramMap.get('id') || '0');
    this.loadOrder(id);
    this.loadEvents(id);

    this.ws.messages.pipe(takeUntil(this.destroy$)).subscribe((msg) => {
      if (['ITEM_CONFIRMED','ORDER_COMPLETED','ORDER_CANCELLED'].includes(msg.type)) {
        this.loadOrder(id);
        this.loadEvents(id);
      }
    });
  }

  loadOrder(id: number): void {
    this.api.getOrder(id).subscribe({
      next: (r) => { this.order = r.data; this.loading = false; },
      error: () => { this.loading = false; this.router.navigate(['/orders']); },
    });
  }

  loadEvents(id: number): void {
    this.api.getEventLog(id).subscribe((r) => { this.eventLog = r.data; });
  }

  startOrder(): void {
    if (!this.order) return;
    this.api.startOrder(this.order.OrderID).subscribe({
      next: () => { this.notify.success('Order started'); this.loadOrder(this.order!.OrderID); },
      error: (err) => this.notify.error(err.error?.message || 'Failed'),
    });
  }

  cancelOrder(): void {
    if (!this.order || !confirm('Cancel this order?')) return;
    this.api.cancelOrder(this.order.OrderID).subscribe({
      next: () => { this.notify.success('Cancelled'); this.router.navigate(['/orders']); },
      error: (err) => this.notify.error(err.error?.message || 'Failed'),
    });
  }

  goToStation(): void {
    if (this.order?.AssignedBinID) {
      this.router.navigate(['/put-to-light'], { queryParams: { orderId: this.order.OrderID } });
    }
  }

  progress(): number {
    if (!this.order || !this.order.TotalItems) return 0;
    return Math.round((this.order.PutItems / this.order.TotalItems) * 100);
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
