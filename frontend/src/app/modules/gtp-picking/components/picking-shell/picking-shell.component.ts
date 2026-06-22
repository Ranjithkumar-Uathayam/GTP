import {
  Component, OnInit, OnDestroy, ViewChild, ViewChildren, QueryList,
  ElementRef, ChangeDetectorRef, HostListener,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WebsocketService } from '../../../../core/services/websocket.service';
import {
  PicklistPreview, PicklistSession, PicklistParty, PicklistItem, ScanFeedback,
} from '../../../../core/models/picking.models';

export type PickView = 'scan-picklist' | 'picking-board' | 'completed';

@Component({
  selector: 'app-picking-shell',
  templateUrl: './picking-shell.component.html',
  styleUrls: ['./picking-shell.component.scss'],
})
export class PickingShellComponent implements OnInit, OnDestroy {
  @ViewChild('picklistInputEl') picklistInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('itemScanInput')   itemScanInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('topCardEl')       topCardEl?: ElementRef<HTMLElement>;
  @ViewChildren('binEl')        binEls?: QueryList<ElementRef<HTMLElement>>;

  svgPath  = '';
  svgW     = 0;
  svgH     = 0;
  scanFlash = false;

  @HostListener('window:resize')
  onResize(): void { this.updateSvgPath(); }

  view: PickView = 'scan-picklist';

  // ── Step 1 ─────────────────────────────────────────────────
  picklistInput  = '';
  picklistLoading = false;
  picklistError  = '';
  preview: PicklistPreview | null = null;

  // ── Session ────────────────────────────────────────────────
  session: PicklistSession | null = null;

  // ── Step 3 ─────────────────────────────────────────────────
  currentParty: PicklistParty | null = null;
  currentItem:  PicklistItem  | null = null;

  scanInput   = '';
  scanLoading = false;
  scanFeedback: ScanFeedback = { state: 'ready', message: '' };

  private scanTimer?: ReturnType<typeof setTimeout>;
  private destroy$ = new Subject<void>();

  constructor(
    private api:    ApiService,
    private notify: NotificationService,
    private ws:     WebsocketService,
    private cdr:    ChangeDetectorRef,
    private route:  ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // Auto-load headerId from query param (e.g. navigated from status page)
    const qHeaderId  = this.route.snapshot.queryParamMap.get('headerId');
    const qSessionId = this.route.snapshot.queryParamMap.get('sessionId');
    if (qSessionId) {
      this.picklistLoading = true;
      this.resumeSession(Number(qSessionId));
    } else if (qHeaderId) {
      this.picklistInput = qHeaderId;
      this.loadPicklist();
    }

    this.ws.on('ITEM_PICKED').pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.session) this.refreshSession();
    });
    this.ws.on('PICKLIST_COMPLETED').pipe(takeUntil(this.destroy$)).subscribe((msg: any) => {
      if (this.session?.sessionId === msg.data?.sessionId) {
        this.view = 'completed';
        this.cdr.markForCheck();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // STEP 1 — Picklist scan → auto-start → picking board
  // ════════════════════════════════════════════════════════════
  loadPicklist(): void {
    const raw = this.picklistInput.trim();
    if (!raw || this.picklistLoading) return;

    this.picklistError   = '';
    this.picklistLoading = true;

    this.api.loadPicklist(raw).subscribe({
      next: (r) => {
        this.preview = r.data;
        if (r.data.existingSessionId) {
          this.resumeSession(r.data.existingSessionId);
        } else {
          this.startNewSession();
        }
      },
      error: (err) => {
        this.picklistLoading = false;
        this.picklistError   = err.error?.message || 'Picklist not found';
      },
    });
  }

  startNewSession(): void {
    if (!this.preview) return;
    this.api.startPicklistSession(this.preview.headerId).subscribe({
      next: (r) => {
        this.picklistLoading = false;
        this.session         = r.data;
        this.goToBoard();
      },
      error: (err) => {
        this.picklistLoading = false;
        this.picklistError   = err.error?.message || 'Failed to start session';
      },
    });
  }

  resumeSession(sessionId: number): void {
    this.api.getPicklistSession(sessionId).subscribe({
      next: (r) => {
        this.picklistLoading = false;
        this.session         = r.data;
        if (r.data.status === 'Completed') {
          this.view = 'completed';
        } else {
          this.goToBoard();
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.picklistLoading = false;
        this.picklistError   = err.error?.message || 'Failed to resume session';
      },
    });
  }

  private goToBoard(): void {
    const first = this.session?.parties.find(p => p.status !== 'completed') ?? null;
    this.currentParty = first;
    this.syncCurrentItem();
    this.view = 'picking-board';
    this.cdr.markForCheck();
    setTimeout(() => {
      this.itemScanInputRef?.nativeElement.focus();
      this.updateSvgPath();
    }, 200);
  }

  refreshSession(preferItemCode?: string): void {
    if (!this.session) return;
    this.api.getPicklistSession(this.session.sessionId).subscribe((r) => {
      this.session = r.data;
      if (this.currentParty) {
        this.currentParty = this.session?.parties.find(
          p => p.cardCode === this.currentParty!.cardCode,
        ) || null;
        this.syncCurrentItem(preferItemCode);
      }
      this.cdr.markForCheck();
      setTimeout(() => this.updateSvgPath(), 50);
    });
  }

  startPickingParty(party: PicklistParty): void {
    this.currentParty = party;
    this.syncCurrentItem();
    this.view = 'picking-board';
    setTimeout(() => {
      this.itemScanInputRef?.nativeElement.focus();
      this.updateSvgPath();
    }, 200);
  }

  updateSvgPath(): void {
    if (!this.topCardEl || !this.binEls || !this.currentParty || !this.session) return;
    const container = this.topCardEl.nativeElement.closest('.ptl-board-main') as HTMLElement;
    if (!container) return;

    const cR = container.getBoundingClientRect();
    const tR = this.topCardEl.nativeElement.getBoundingClientRect();

    const parties = this.session.parties;
    const idx     = parties.findIndex(p => p.cardCode === this.currentParty!.cardCode);
    const binArr  = this.binEls.toArray();
    if (idx < 0 || !binArr[idx]) return;

    const bR = binArr[idx].nativeElement.getBoundingClientRect();
    const x1 = tR.left + tR.width  / 2 - cR.left;
    const y1 = tR.bottom - cR.top;
    const x2 = bR.left  + bR.width  / 2 - cR.left;
    const y2 = bR.top   - cR.top;
    const cy = y1 + (y2 - y1) * 0.55;

    this.svgW    = cR.width;
    this.svgH    = cR.height;
    this.svgPath = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
    this.cdr.markForCheck();
  }

  nextParty(): void {
    if (!this.session) return;
    const pending = this.session.parties.find(p => p.status !== 'completed');
    if (pending) {
      this.currentParty = pending;
      this.syncCurrentItem();
      this.cdr.markForCheck();
      setTimeout(() => {
        this.itemScanInputRef?.nativeElement.focus();
        this.updateSvgPath();
      }, 150);
    } else {
      this.view = 'completed';
      this.cdr.markForCheck();
    }
  }

  syncCurrentItem(preferItemCode?: string): void {
    if (!this.currentParty) return;
    // Prefer the specified item (e.g. the one just scanned), else first pending
    if (preferItemCode) {
      const preferred = this.currentParty.items.find(
        i => i.itemCode === preferItemCode && i.status !== 'Completed',
      );
      if (preferred) { this.currentItem = preferred; return; }
    }
    this.currentItem = this.currentParty.items.find(
      i => i.status !== 'Completed',
    ) || null;
  }

  // ════════════════════════════════════════════════════════════
  // STEP 3 — Picking board: scan processing
  // ════════════════════════════════════════════════════════════
  processItemScan(): void {
    const raw = this.scanInput.trim();
    if (!raw || this.scanLoading || !this.session) return;

    // Extract itemCode from barcode (format: ITEMCODE|ST|ID|GROUP|NUM|QTY)
    const itemCode = raw.split('|')[0];

    // Find the party that owns this item with pending quantity
    const targetParty = this.findPartyForItem(itemCode);
    if (!targetParty) {
      this.scanInput = '';
      this.setScanFeedback('invalid', `Item "${itemCode}" not found in any pending party`);
      setTimeout(() => this.itemScanInputRef?.nativeElement.focus(), 50);
      return;
    }

    // Switch highlight to the correct party before API call
    if (targetParty.cardCode !== this.currentParty?.cardCode) {
      this.currentParty = targetParty;
    }
    this.syncCurrentItem(itemCode);
    this.cdr.markForCheck();
    setTimeout(() => this.updateSvgPath(), 50);

    this.scanLoading = true;
    this.setScanFeedback('processing', `Scanning…`);

    this.api.processPickScan(this.session.sessionId, raw, targetParty.cardCode).subscribe({
      next: (r) => {
        this.scanLoading = false;
        this.scanInput   = '';
        const data = r.data;

        if (data.picklistCompleted) {
          this.setScanFeedback('done', `Picklist ${this.session!.headerId} completed!`);
          this.refreshSession();
          setTimeout(() => { this.view = 'completed'; this.cdr.markForCheck(); }, 1800);
          return;
        }

        if (data.partyCompleted) {
          this.setScanFeedback('done', `${targetParty.cardName} — Party completed!`);
          this.refreshSession();
          setTimeout(() => this.nextParty(), 1800);
          return;
        }

        if (data.itemCompleted) {
          this.setScanFeedback('success', `${data.itemCode} — Item complete!`);
        } else {
          this.setScanFeedback('success',
            `${data.itemCode}  ✓ ${data.newPickedQty}/${data.requiredQty} picked`);
        }

        // Flash the active bin
        this.scanFlash = true;
        this.cdr.markForCheck();
        setTimeout(() => { this.scanFlash = false; this.cdr.markForCheck(); }, 700);

        // If item is complete, next item in party; otherwise stay on same item
        this.refreshSession(data.itemCompleted ? undefined : itemCode);
        setTimeout(() => this.itemScanInputRef?.nativeElement.focus(), 50);
      },
      error: (err) => {
        this.scanLoading = false;
        this.scanInput   = '';
        const code = err.error?.code;
        if (code === 'DUPLICATE_SCAN') {
          this.setScanFeedback('duplicate', `Already scanned — ${err.error?.message}`);
        } else if (code === 'ITEM_ALREADY_DONE') {
          this.setScanFeedback('invalid', `Item "${itemCode}" already fully picked`);
        } else {
          this.setScanFeedback('error', err.error?.message || 'Scan failed');
        }
        setTimeout(() => this.itemScanInputRef?.nativeElement.focus(), 50);
      },
    });
  }

  // Find the first party that has this itemCode with remaining quantity
  private findPartyForItem(itemCode: string): PicklistParty | null {
    if (!this.session) return null;
    for (const party of this.session.parties) {
      const match = party.items.find(
        i => i.itemCode === itemCode && i.status !== 'Completed'
           && i.pickedQty < i.requiredQty,
      );
      if (match) return party;
    }
    return null;
  }

  setScanFeedback(state: ScanFeedback['state'], message: string): void {
    clearTimeout(this.scanTimer);
    this.scanFeedback = { state, message };
    this.cdr.markForCheck();
    if (state !== 'processing' && state !== 'ready' && state !== 'done') {
      this.scanTimer = setTimeout(() => {
        this.scanFeedback = { state: 'ready', message: '' };
        this.cdr.markForCheck();
      }, state === 'success' ? 2500 : 3500);
    }
  }

  // ── Helpers ────────────────────────────────────────────────
  scanFeedbackIcon(): string {
    switch (this.scanFeedback.state) {
      case 'processing': return 'hourglass_empty';
      case 'success':    return 'check_circle';
      case 'done':       return 'done_all';
      case 'invalid':    return 'search_off';
      case 'duplicate':  return 'content_copy';
      case 'error':      return 'error_outline';
      default:           return 'qr_code_scanner';
    }
  }

  itemProgress(item: PicklistItem): number {
    if (!item.requiredQty) return 0;
    return Math.min(100, Math.round((item.pickedQty / item.requiredQty) * 100));
  }

  partyProgress(party: PicklistParty): number {
    if (!party.totalRequiredQty) return 0;
    return Math.min(100, Math.round((party.totalPickedQty / party.totalRequiredQty) * 100));
  }

  overallProgress(): number {
    if (!this.session) return 0;
    const total = this.session.parties.reduce((s, p) => s + p.totalRequiredQty, 0);
    const picked = this.session.parties.reduce((s, p) => s + p.totalPickedQty, 0);
    return total ? Math.round((picked / total) * 100) : 0;
  }

  isItemDone(item: PicklistItem): boolean {
    return item.status === 'Completed';
  }

  isItemActive(item: PicklistItem): boolean {
    return item.itemCode === this.currentItem?.itemCode;
  }

  currentItemIndex(): number {
    if (!this.currentParty || !this.currentItem) return 0;
    return (this.currentParty.items.findIndex(i => i.itemCode === this.currentItem!.itemCode) + 1);
  }

  doneItemCount(party: PicklistParty): number {
    return party.items.filter(i => this.isItemDone(i)).length;
  }

  totalItemsCount(): number {
    return this.session?.parties.reduce((s, p) => s + p.items.length, 0) ?? 0;
  }

  totalQtyPicked(): number {
    return Math.round(
      this.session?.parties.reduce((s, p) => s + p.totalPickedQty, 0) ?? 0,
    );
  }

  backToPicklist(): void {
    this.preview       = null;
    this.session       = null;
    this.currentParty  = null;
    this.currentItem   = null;
    this.picklistInput = '';
    this.picklistError = '';
    this.view          = 'scan-picklist';
    setTimeout(() => this.picklistInputRef?.nativeElement.focus(), 150);
  }

  backToParties(): void {
    this.backToPicklist();
  }

  startOver(): void {
    this.backToPicklist();
  }

  ngOnDestroy(): void {
    clearTimeout(this.scanTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
