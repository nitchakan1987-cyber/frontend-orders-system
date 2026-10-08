import { Routes } from '@angular/router';
import { OrdersList } from './orders-list';
import { OrderView } from './order-view';
import { DeliveryReport } from './delivery-report';
export const routes: Routes = [
  { path: '', redirectTo: 'orders', pathMatch: 'full' },
  { path: 'orders', component: OrdersList, title: 'สรุปการรับคำสั่งซื้อ' },
  { path: 'orders/new', component: OrderView, data: { mode: 'create' }, title: 'สร้างคำสั่งซื้อ' },
  { path: 'orders/:id/edit', component: OrderView, data: { mode: 'edit' }, title: 'แก้ไขคำสั่งซื้อ' },
  { path: 'orders/:id', component: OrderView, title: 'รายละเอียดคำสั่งซื้อ' },
  { path: 'reports/delivery-schedule',component: DeliveryReport, title: 'รายงานคำสั่งซื้อถึงกำหนดส่ง',},
  { path: '**', redirectTo: 'orders' },
];
