import {
  Component, Input, Output, EventEmitter,
  OnInit, OnChanges, OnDestroy, SimpleChanges,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Order, OrderItem } from '../../../../core/models';
import { ApiService } from '../../../../core/services/api.service';
import { QrScannerService, QrPayload } from '../../../../core/services/qr-scanner.service';

export interface PtlBin {
  itemId:      number;
  itemCode:    string;
  itemName:    string;
  requiredQty: number;
  putQty:      number;
  remaining:   number;
  uom:         string;
  status:      'pending' | 'active' | 'done' | 'skipped';
  sortSeq:     number;
}

export type ScanState = 'ready' | 'processing' | 'success' | 'mismatch' | 'not-found' | 'already-done' | 'error';

@Component({
  selector: 'app-ptl-board',
  templateUrl: './ptl-board.component.html',
  styleUrls: ['./ptl-board.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PtlBoardComponent implements OnInit, OnChanges, OnDestroy {
  @Input()  order:      Order | null = null;
  @Input()  confirming  = false;
  @Output() onConfirm      = new EventEmitter<void>();
  @Output() onComplete     = new EventEmitter<void>();
  @Output() onCancel       = new EventEmitter<void>();
  @Output() onScanComplete = new EventEmitter<void>();

  bins:        PtlBin[]      = [];
  activeBin:   PtlBin | null = null;
  activeIndex  = -1;
  confirmAnim  = false;

  pathD   = '';
  viewBox = '0 0 100 100';

  scanState:   ScanState = 'ready';
  scanMessage  = '';

  private destroy$   = new Subject<void>();
  private scanTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private cdr:     ChangeDetectorRef,
    private api:     ApiService,
    private scanner: QrScannerService,
  ) {}

  ngOnInit(): void {
    this.scanner.scan$
      .pipe(takeUntil(this.destroy$))
      .subscribe(p => this.handleScan(p));
  }

  ngOnChanges(ch: SimpleChanges): void {
    this.buildBins();
    this.updatePath();

    if (ch['order']) {
      if (this.order) {
        this.scanner.start();
      } else {
        this.scanner.stop();
        this.scanState  = 'ready';
        this.scanMessage = '';
      }
    }
  }

  // ── Build the flat bin list from order items ──────────────
  buildBins(): void {
    if (!this.order?.items) { this.bins = []; this.activeBin = null; return; }

    const firstPending = this.order.items.findIndex(
      i => i.Status !== 'Completed' && i.Status !== 'Skipped',
    );

    this.bins = this.order.items.map((item, idx) => {
      let status: PtlBin['status'] = 'pending';
      if (item.Status === 'Completed')      status = 'done';
      else if (item.Status === 'Skipped')   status = 'skipped';
      else if (idx === firstPending)        status = 'active';

      return {
        itemId:      item.ItemID,
        itemCode:    item.ItemCode,
        itemName:    item.ItemName,
        requiredQty: item.RequiredQty,
        putQty:      item.PutQty,
        remaining:   item.RequiredQty - item.PutQty,
        uom:         item.UOM,
        status,
        sortSeq:     item.SortSeq,
      };
    });

    this.activeIndex = this.bins.findIndex(b => b.status === 'active');
    this.activeBin   = this.activeIndex >= 0 ? this.bins[this.activeIndex] : null;
  }

  // ── SVG connector path ────────────────────────────────────
  updatePath(): void {
    const n   = this.bins.length || 1;
    const idx = Math.max(0, this.activeIndex);
    const x1  = 50;
    const y1  = 0;
    const x2  = ((idx + 0.5) / n) * 100;
    const y2  = 100;
    const cy  = 55;
    this.pathD  = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
    this.viewBox = '0 0 100 100';
  }

  // ── QR scan handler ───────────────────────────────────────
  handleScan(payload: QrPayload): void {
    if (!this.order || this.scanState === 'processing') return;

    // Fast client-side order mismatch check
    if (payload.orderNumber.toUpperCase() !== this.order.OrderNumber.toUpperCase()) {
      this.setScanState('mismatch', `Wrong order — scanned: ${payload.orderNumber}`);
      return;
    }

    this.setScanState('processing', `Scanning ${payload.itemCode}…`);

    this.api.scanQr(payload.orderNumber, payload.itemCode, payload.qty).subscribe({
      next: () => {
        this.triggerConfirmAnim();
        this.setScanState('success', `✓ ${payload.itemCode} · qty ${payload.qty} confirmed`);
        this.onScanComplete.emit();
        this.cdr.markForCheck();
      },
      error: (err) => {
        const code = err.error?.code as string;
        if (code === 'ITEM_NOT_IN_ORDER') {
          this.setScanState('not-found', `"${payload.itemCode}" not found in this order`);
        } else if (code === 'ITEM_ALREADY_DONE') {
          this.setScanState('already-done', `"${payload.itemCode}" is already completed`);
        } else if (code === 'ORDER_NOT_ACTIVE') {
          this.setScanState('error', `Order is no longer active`);
        } else {
          this.setScanState('error', err.error?.message || 'Scan failed');
        }
        this.cdr.markForCheck();
      },
    });
  }

  setScanState(state: ScanState, message: string): void {
    clearTimeout(this.scanTimer);
    this.scanState   = state;
    this.scanMessage = message;
    this.cdr.markForCheck();

    if (state !== 'processing' && state !== 'ready') {
      const delay = state === 'success' ? 2000 : 3500;
      this.scanTimer = setTimeout(() => {
        this.scanState   = 'ready';
        this.scanMessage = '';
        this.cdr.markForCheck();
      }, delay);
    }
  }

  // ── Called by parent after button-based API confirm ───────
  triggerConfirmAnim(): void {
    this.confirmAnim = true;
    this.cdr.markForCheck();
    setTimeout(() => { this.confirmAnim = false; this.cdr.markForCheck(); }, 600);
  }

  // ── Helpers ───────────────────────────────────────────────
  progress(): number {
    if (!this.order?.TotalItems) return 0;
    return Math.round((this.order.PutItems / this.order.TotalItems) * 100);
  }

  doneCount(): number { return this.bins.filter(b => b.status === 'done').length; }

  allDone(): boolean {
    return this.bins.length > 0 && this.bins.every(b => b.status === 'done' || b.status === 'skipped');
  }

  priorityLabel(): string {
    return this.order?.Priority === 3 ? 'URGENT' : this.order?.Priority === 2 ? 'HIGH' : 'NORMAL';
  }

  priorityClass(): string {
    return this.order?.Priority === 3 ? 'urgent' : this.order?.Priority === 2 ? 'high' : 'normal';
  }

  scanIcon(): string {
    switch (this.scanState) {
      case 'processing':  return 'hourglass_empty';
      case 'success':     return 'check_circle';
      case 'mismatch':    return 'swap_horiz';
      case 'not-found':   return 'search_off';
      case 'already-done':return 'check_circle_outline';
      case 'error':       return 'error_outline';
      default:            return 'qr_code_scanner';
    }
  }

  ngOnDestroy(): void {
    this.scanner.stop();
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.scanTimer);
  }
}
