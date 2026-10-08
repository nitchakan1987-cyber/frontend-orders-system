import { Routes } from '@angular/router';
import { OrdersList } from './orders-list';
import { OrderView } from './order-view';

export const routes: Routes = [
  { path: '', redirectTo: 'orders', pathMatch: 'full' },
  { path: 'orders', component: OrdersList, title: 'สรุปการรับคำสั่งซื้อ' },
  { path: 'orders/new', component: OrderView, data: { mode: 'create' }, title: 'สร้างคำสั่งซื้อ' },
  { path: 'orders/:id/edit', component: OrderView, data: { mode: 'edit' }, title: 'แก้ไขคำสั่งซื้อ' },
  { path: 'orders/:id', component: OrderView, title: 'รายละเอียดคำสั่งซื้อ' },
  { path: '**', redirectTo: 'orders' },
];
