import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil, startWith } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { WebsocketService } from '../../../core/services/websocket.service';
import { DashboardSummary, Station } from '../../../core/models';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  summary: DashboardSummary | null = null;
  stations: Station[] = [];
  loading = true;
  private destroy$ = new Subject<void>();

  recentCols = ['OrderNumber', 'CustomerName', 'Status', 'Progress', 'CreatedAt'];

  constructor(private api: ApiService, private ws: WebsocketService) {}

  ngOnInit(): void {
    this.load();
    // Auto-refresh every 30s
    interval(30000).pipe(startWith(0), takeUntil(this.destroy$)).subscribe(() => this.load());

    // Refresh on order events
    this.ws.messages.pipe(takeUntil(this.destroy$)).subscribe((msg) => {
      if (['ORDER_COMPLETED','ORDER_STARTED','BIN_ACTIVATED'].includes(msg.type)) {
        this.load();
      }
    });
  }

  load(): void {
    this.api.getDashboardSummary().subscribe({
      next: (r) => { this.summary = r.data; this.loading = false; },
      error: () => { this.loading = false; },
    });
    this.api.getStationStatus().subscribe((r) => { this.stations = r.data; });
  }

  totalOrders(): number {
    if (!this.summary) return 0;
    return Object.values(this.summary.orderCounts).reduce((a, b) => a + b, 0);
  }

  progress(order: any): number {
    if (!order.TotalItems) return 0;
    return Math.round((order.PutItems / order.TotalItems) * 100);
  }

  stationUtil(s: Station): number {
    if (!s.TotalBins) return 0;
    return Math.round(((s.ActiveBins || 0) / s.TotalBins) * 100);
  }

  priorityLabel(p: number): string {
    return p === 3 ? 'Urgent' : p === 2 ? 'High' : 'Normal';
  }

  priorityColor(p: number): string {
    return p === 3 ? 'warn' : p === 2 ? 'accent' : 'primary';
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
