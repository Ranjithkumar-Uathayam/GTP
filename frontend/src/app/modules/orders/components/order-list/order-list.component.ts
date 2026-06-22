import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormControl } from '@angular/forms';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WebsocketService } from '../../../../core/services/websocket.service';
import { Order } from '../../../../core/models';
import { OrderCreateDialogComponent } from '../order-create/order-create-dialog.component';

@Component({
  selector: 'app-order-list',
  templateUrl: './order-list.component.html',
  styleUrls: ['./order-list.component.scss'],
})
export class OrderListComponent implements OnInit, OnDestroy {
  orders: Order[] = [];
  total = 0;
  page = 1;
  limit = 20;
  loading = false;

  searchCtrl   = new FormControl('');
  statusFilter = '';
  columns = ['OrderNumber','CustomerName','Priority','Status','Progress','Bin','CreatedAt','Actions'];

  private destroy$ = new Subject<void>();

  constructor(
    private api:    ApiService,
    private notify: NotificationService,
    private ws:     WebsocketService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.load();

    this.searchCtrl.valueChanges.pipe(
      debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$),
    ).subscribe(() => { this.page = 1; this.load(); });

    this.ws.messages.pipe(takeUntil(this.destroy$)).subscribe((msg) => {
      if (['ORDER_COMPLETED','ORDER_STARTED','ORDER_CANCELLED'].includes(msg.type)) {
        this.load();
      }
    });
  }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { page: this.page, limit: this.limit };
    if (this.searchCtrl.value) params['search'] = this.searchCtrl.value;
    if (this.statusFilter)     params['status'] = this.statusFilter;

    this.api.getOrders(params).subscribe({
      next: (r) => {
        this.orders  = r.data;
        this.total   = r.total;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  onPageChange(e: any): void {
    this.page  = e.pageIndex + 1;
    this.limit = e.pageSize;
    this.load();
  }

  openCreate(): void {
    const ref = this.dialog.open(OrderCreateDialogComponent, { width: '600px' });
    ref.afterClosed().subscribe((created) => { if (created) this.load(); });
  }

  startOrder(order: Order, event: Event): void {
    event.stopPropagation();
    this.api.startOrder(order.OrderID).subscribe({
      next: () => { this.notify.success(`Order ${order.OrderNumber} started`); this.load(); },
      error: (err) => this.notify.error(err.error?.message || 'Failed to start'),
    });
  }

  cancelOrder(order: Order, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Cancel order ${order.OrderNumber}?`)) return;
    this.api.cancelOrder(order.OrderID).subscribe({
      next: () => { this.notify.success('Order cancelled'); this.load(); },
      error: (err) => this.notify.error(err.error?.message || 'Failed'),
    });
  }

  progress(o: Order): number {
    return o.TotalItems ? Math.round((o.PutItems / o.TotalItems) * 100) : 0;
  }

  priorityLabel(p: number): string {
    return p === 3 ? 'Urgent' : p === 2 ? 'High' : 'Normal';
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
