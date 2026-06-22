import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { InventoryItem } from '../../../../core/models';
import { AdjustStockDialogComponent } from '../adjust-stock-dialog/adjust-stock-dialog.component';

@Component({
  selector: 'app-inventory-list',
  templateUrl: './inventory-list.component.html',
  styleUrls: ['./inventory-list.component.scss'],
})
export class InventoryListComponent implements OnInit {
  items: InventoryItem[] = [];
  total = 0;
  page = 1;
  limit = 30;
  loading = false;
  lowStockOnly = false;

  searchCtrl = new FormControl('');
  columns = ['ItemCode','ItemName','Brand','Category','AvailableQty','ReservedQty','FreeQty','Status','Actions'];

  constructor(
    private api:    ApiService,
    private notify: NotificationService,
    private dialog: MatDialog,
    private route:  ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((p) => {
      if (p['lowStock'] === 'true') this.lowStockOnly = true;
      this.load();
    });

    this.searchCtrl.valueChanges.pipe(
      debounceTime(300), distinctUntilChanged(),
    ).subscribe(() => { this.page = 1; this.load(); });
  }

  load(): void {
    this.loading = true;
    const params: Record<string, unknown> = { page: this.page, limit: this.limit };
    if (this.searchCtrl.value) params['search'] = this.searchCtrl.value;
    if (this.lowStockOnly)     params['lowStock'] = 'true';

    this.api.getInventory(params).subscribe({
      next: (r) => { this.items = r.data; this.total = r.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  onPageChange(e: any): void {
    this.page  = e.pageIndex + 1;
    this.limit = e.pageSize;
    this.load();
  }

  openAdjust(item: InventoryItem): void {
    const ref = this.dialog.open(AdjustStockDialogComponent, { width: '400px', data: item });
    ref.afterClosed().subscribe((updated) => { if (updated) this.load(); });
  }

  stockStatus(item: InventoryItem): string {
    const free = item.FreeQty ?? (item.AvailableQty - item.ReservedQty);
    if (free <= 0)        return 'Out of Stock';
    if (free <= item.MinQty) return 'Low Stock';
    return 'In Stock';
  }

  stockStatusClass(item: InventoryItem): string {
    const s = this.stockStatus(item);
    if (s === 'Out of Stock') return 'out';
    if (s === 'Low Stock')    return 'low';
    return 'in';
  }

  stockPercent(item: InventoryItem): number {
    if (!item.AvailableQty) return 0;
    return Math.min(100, Math.round(((item.FreeQty ?? 0) / (item.AvailableQty || 1)) * 100));
  }
}
