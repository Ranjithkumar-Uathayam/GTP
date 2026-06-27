import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadChildren: () => import('./modules/dashboard/dashboard.module').then(m => m.DashboardModule),
  },
  {
    path: 'picking',
    loadChildren: () => import('./modules/gtp-picking/gtp-picking.module').then(m => m.GtpPickingModule),
  },
  {
    path: 'adam',
    loadChildren: () => import('./modules/adam-dashboard/adam-dashboard.module').then(m => m.AdamDashboardModule),
  },
  {
    path: 'lights',
    loadChildren: () => import('./modules/station-lights/station-lights.module').then(m => m.StationLightsModule),
  },
  { path: '**', redirectTo: 'dashboard' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
