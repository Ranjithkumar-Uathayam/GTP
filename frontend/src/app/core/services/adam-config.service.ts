import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdamDeviceConfig } from '../models';

export interface AdamDeviceConfigInput {
  deviceCode: string;
  ipAddress: string;
  port?: number;
  unitId?: number;
  outputStartChannel: number;
  outputEndChannel: number;
  macAddress?: string | null;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdamConfigService {
  private base = `${environment.apiUrl}/adam-devices`;

  constructor(private http: HttpClient) {}

  list(): Observable<{ success: boolean; data: AdamDeviceConfig[] }> {
    return this.http.get<any>(this.base);
  }

  getByCode(deviceCode: string): Observable<{ success: boolean; data: AdamDeviceConfig }> {
    return this.http.get<any>(`${this.base}/${encodeURIComponent(deviceCode)}`);
  }

  create(body: AdamDeviceConfigInput): Observable<{ success: boolean; data: AdamDeviceConfig }> {
    return this.http.post<any>(this.base, body);
  }

  update(id: number, body: Partial<AdamDeviceConfigInput>): Observable<{ success: boolean; data: AdamDeviceConfig }> {
    return this.http.put<any>(`${this.base}/${id}`, body);
  }

  remove(id: number): Observable<{ success: boolean }> {
    return this.http.delete<any>(`${this.base}/${id}`);
  }

  detectMac(ip: string): Observable<{ success: boolean; data: { ip: string; mac: string | null } }> {
    const params = new HttpParams().set('ip', ip);
    return this.http.get<any>(`${this.base}/detect-mac`, { params });
  }
}
