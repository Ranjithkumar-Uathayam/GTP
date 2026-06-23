import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  AdamService,
  AdamStatus,
  AdamConnection,
} from '../../../services/adam.service';

interface ChannelCard {
  index:   number;
  label:   string;
  active:  boolean;
  loading: boolean;
}

@Component({
  selector: 'app-adam-dashboard',
  templateUrl: './adam-dashboard.component.html',
  styleUrls: ['./adam-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdamDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  status: AdamStatus = {
    connected:         false,
    ts:                null,
    di:                Array(12).fill(false),
    do:                Array(8).fill(false),
    diCount:           12,
    doCount:           8,
    ip:                '',
    port:              502,
    unitId:            1,
    reconnectAttempts: 0,
    error:             null,
  };

  connection: AdamConnection = {
    connected:         false,
    reconnectAttempts: 0,
    lastError:         null,
    ip:                '',
    port:              '502',
    unitId:            '1',
    protocol:          'Modbus TCP',
  };

  doCards: ChannelCard[] = Array.from({ length: 8 }, (_, i) => ({
    index:   i,
    label:   `DO ${i}`,
    active:  false,
    loading: false,
  }));

  lastResponse  = '';
  allValue      = 0;      // 0–255 bitmask for write-all
  actionLoading = false;

  // Bit display helpers
  readonly doBitOrder = [7, 6, 5, 4, 3, 2, 1, 0];
  readonly diRows     = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  constructor(private adam: AdamService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.adam.status$.pipe(takeUntil(this.destroy$)).subscribe((s) => {
      this.status = s;
      this._applyDo(s.do);
      this.lastResponse = s.error
        ? `Error: ${s.error}`
        : s.ts
        ? `OK — ${s.ts}`
        : '';
      this.cdr.markForCheck();
    });

    this.adam.getConnection().subscribe({
      next:  (c) => { this.connection = c; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  private _applyDo(doChannels: boolean[]): void {
    this.doCards.forEach((c) => {
      c.active  = doChannels?.[c.index] ?? false;
      c.loading = false;
    });
  }

  // ── DO toggle ──────────────────────────────────────────────────────────────
  toggleChannel(card: ChannelCard): void {
    if (!this.status.connected || card.loading) return;
    card.loading = true;
    this.cdr.markForCheck();

    const obs = card.active
      ? this.adam.setChannelOff(card.index)
      : this.adam.setChannelOn(card.index);

    obs.subscribe({
      next: (r) => {
        this.lastResponse = `ch${r.channel} → ${r.state ? 'ON' : 'OFF'}  (${r.fc})`;
        card.loading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.lastResponse = e.message;
        card.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Write all DO ───────────────────────────────────────────────────────────
  setAllOff(): void  { this._writeAll(0); }
  setAllOn(): void   { this._writeAll(255); }

  writeAllValue(): void {
    const v = this.allValue & 0xFF;
    this._writeAll(v);
  }

  private _writeAll(value: number): void {
    if (!this.status.connected) return;
    this.actionLoading = true;
    this.adam.writeAllOutputs(value).subscribe({
      next:  (r) => {
        this.lastResponse = `All DO → 0x${r.hex}  (${r.fc})`;
        this.actionLoading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.lastResponse = e.message;
        this.actionLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  refresh(): void {
    this.adam.requestStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
