import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

// ── Modbus TCP data model ─────────────────────────────────────────────────────

export interface AdamStatus {
  connected:         boolean;
  ts:                string | null;
  di:                boolean[];   // 12 Digital Inputs  (FC02 addr 0x0000)
  do:                boolean[];   // 8  Digital Outputs  (FC01 addr 0x0010)
  diCount:           number;
  doCount:           number;
  ip:                string;
  port:              number;
  unitId:            number;
  reconnectAttempts: number;
  error:             string | null;
}

export interface AdamConnection {
  connected:         boolean;
  reconnectAttempts: number;
  lastError:         string | null;
  ip:                string;
  port:              string;
  unitId:            string;
  protocol:          string;
}

export interface AdamWriteResult {
  channel?: number;
  state?:   boolean;
  address?: string;
  value?:   number;
  hex?:     string;
  states?:  boolean[];
  fc:       string;
  ts:       string;
}

export interface AdamReadResult {
  channels:  boolean[];
  count:     number;
  startAddr: string;
  fc:        string;
  ts:        string;
}

// ─────────────────────────────────────────────────────────────────────────────

function emptyStatus(): AdamStatus {
  return {
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
}

@Injectable({ providedIn: 'root' })
export class AdamService implements OnDestroy {
  private socket!: Socket;
  private destroy$ = new Subject<void>();

  private _status$ = new BehaviorSubject<AdamStatus>(emptyStatus());
  readonly status$: Observable<AdamStatus> = this._status$.asObservable();

  constructor(private http: HttpClient, private zone: NgZone) {
    this._connectSocket();
  }

  private _connectSocket(): void {
    const baseUrl = environment.socketUrl || 'http://10.0.10.211:4501';
    this.socket = io(baseUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 3000,
    });

    this.socket.on('adam-status', (data: AdamStatus) => {
      this.zone.run(() => this._status$.next(data));
    });

    this.socket.on('connect',    () => console.log('[AdamService] Socket.IO connected'));
    this.socket.on('disconnect', () => console.warn('[AdamService] Socket.IO disconnected'));
  }

  requestStatus(): void {
    this.socket.emit('request-status');
  }

  // ── REST — Status ─────────────────────────────────────────────────────────
  getStatus(): Observable<AdamStatus> {
    return this.http.get<AdamStatus>(`${environment.apiUrl}/adam/status`);
  }

  getConnection(): Observable<AdamConnection> {
    return this.http.get<AdamConnection>(`${environment.apiUrl}/adam/connection`);
  }

  checkConnection(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/adam/check`);
  }

  // ── REST — Read ───────────────────────────────────────────────────────────
  readInputs(): Observable<AdamReadResult> {
    return this.http.get<AdamReadResult>(`${environment.apiUrl}/adam/input`);
  }

  readOutputs(): Observable<AdamReadResult> {
    return this.http.get<AdamReadResult>(`${environment.apiUrl}/adam/output`);
  }

  // ── REST — Write ──────────────────────────────────────────────────────────

  /** FC05 — turn single DO channel on */
  setChannelOn(channel: number): Observable<AdamWriteResult> {
    return this.http.post<AdamWriteResult>(`${environment.apiUrl}/adam/output/${channel}/on`, {});
  }

  /** FC05 — turn single DO channel off */
  setChannelOff(channel: number): Observable<AdamWriteResult> {
    return this.http.post<AdamWriteResult>(`${environment.apiUrl}/adam/output/${channel}/off`, {});
  }

  /** FC05 — write one DO channel with explicit state */
  writeChannel(channel: number, state: boolean): Observable<AdamWriteResult> {
    return this.http.post<AdamWriteResult>(`${environment.apiUrl}/adam/output`, { channel, state });
  }

  /** FC15 — write all 8 DO channels from bitmask (0–255) */
  writeAllOutputs(value: number): Observable<AdamWriteResult> {
    return this.http.post<AdamWriteResult>(`${environment.apiUrl}/adam/output/all`, { value });
  }

  /** FC15 — write all DO channels from 1–2 char hex string */
  writeAllHex(hex: string): Observable<AdamWriteResult> {
    return this.http.post<AdamWriteResult>(`${environment.apiUrl}/adam/output/all`, { hex });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.socket?.disconnect();
  }
}
