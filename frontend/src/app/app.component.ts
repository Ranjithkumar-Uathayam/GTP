import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { WebsocketService } from './core/services/websocket.service';
import { NotificationService } from './core/services/notification.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  sidenavOpen = true;
  currentPath = '';
  private destroy$ = new Subject<void>();

  navItems: NavItem[] = [
    { path: '/dashboard',    label: 'Dashboard',     icon: 'dashboard' },
    { path: '/put-to-light', label: 'Put-to-Light',  icon: 'lightbulb' },
    { path: '/picking',      label: 'GTP Picking',   icon: 'inventory' },
    { path: '/orders',       label: 'Orders',        icon: 'assignment' },
    { path: '/inventory',    label: 'Inventory',     icon: 'inventory_2' },
    { path: '/stations',     label: 'Stations',      icon: 'settings_input_component' },
  ];

  constructor(
    private router: Router,
    private ws: WebsocketService,
    private notify: NotificationService,
  ) {}

  ngOnInit(): void {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$),
    ).subscribe((e: any) => {
      this.currentPath = e.urlAfterRedirects;
    });

    // Show toast on key WS events
    this.ws.on('ORDER_COMPLETED').pipe(takeUntil(this.destroy$)).subscribe((msg: any) => {
      this.notify.success(`✅ Order ${msg.data?.orderNumber} completed`);
    });

    this.ws.on('BIN_ACTIVATED').pipe(takeUntil(this.destroy$)).subscribe((msg: any) => {
      this.notify.info(`💡 Bin ${msg.data?.BinCode} activated — ${msg.data?.orderNumber}`);
    });
  }

  isActive(path: string): boolean {
    return this.currentPath.startsWith(path);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
