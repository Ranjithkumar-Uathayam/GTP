import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadChildren: () => import('./modules/dashboard/dashboard.module').then(m => m.DashboardModule),
  },
  {
    path: 'orders',
    loadChildren: () => import('./modules/orders/orders.module').then(m => m.OrdersModule),
  },
  {
    path: 'put-to-light',
    loadChildren: () => import('./modules/put-to-light/put-to-light.module').then(m => m.PutToLightModule),
  },
  {
    path: 'picking',
    loadChildren: () => import('./modules/gtp-picking/gtp-picking.module').then(m => m.GtpPickingModule),
  },
  {
    path: 'inventory',
    loadChildren: () => import('./modules/inventory/inventory.module').then(m => m.InventoryModule),
  },
  {
    path: 'stations',
    loadChildren: () => import('./modules/stations/stations.module').then(m => m.StationsModule),
  },
  { path: '**', redirectTo: 'dashboard' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
