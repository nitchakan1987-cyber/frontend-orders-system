import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OrdersApi, OrderDetail } from './orders-api';
import { OrderForm } from './order-form';

@Component({
  selector: 'app-order-view',
  standalone: true,
  imports: [CommonModule, OrderForm],
  templateUrl: './order-view.html',
  styleUrls: ['./app.scss', './order-pages.scss'],
})
export class OrderView {
  private readonly api = inject(OrdersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  readonly mode = this.route.snapshot.data['mode'] === 'create' ? 'create' : 'view';
  readonly detail = signal<OrderDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly customerName = signal('');
  readonly salespersonName = signal('');
  readonly nameWarning = signal('');
  private orderId = 0;
  private request = 0;

  constructor() {
    this.destroyRef.onDestroy(() => { ++this.request; });
    if (this.mode === 'create') return;
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.orderId = Number(params.get('id'));
      void this.loadDetail();
    });
  }

  async loadDetail(): Promise<void> {
    const request = ++this.request;
    this.detail.set(null);
    this.error.set('');
    this.customerName.set('');
    this.salespersonName.set('');
    this.nameWarning.set('');
    if (!Number.isSafeInteger(this.orderId) || this.orderId <= 0) {
      this.loading.set(false);
      this.error.set('เลขคำสั่งซื้อไม่ถูกต้อง');
      return;
    }
    this.loading.set(true);
    try {
      const response = await this.api.orderDetail(this.orderId);
      if (request !== this.request) return;
      this.detail.set(response.data);
      // Names are optional lookups; a failure must not hide the order.
      void this.loadNames(response.data, request);
    } catch (error) {
      if (request !== this.request) return;
      if (error instanceof HttpErrorResponse) {
        if (error.status === 404) this.error.set('ไม่พบคำสั่งซื้อ หรือไม่มีสิทธิ์เข้าถึง');
        else if (error.status === 401) this.error.set('Token ไม่ถูกต้อง');
        else if (error.status === 0) this.error.set('เชื่อมต่อ Backend ไม่ได้');
        else this.error.set(error.error?.error?.message ?? 'โหลดรายละเอียดไม่สำเร็จ');
      } else this.error.set('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  private async loadNames(order: OrderDetail, request: number): Promise<void> {
    const [sales, customers] = await Promise.allSettled([
      this.api.salespersons(),
      this.api.customers(String(order.salespersonId)),
    ]);
    if (request !== this.request) return;
    if (sales.status === 'fulfilled') {
      this.salespersonName.set(sales.value.data.find(item => item.id === order.salespersonId)?.name ?? '');
    }
    if (customers.status === 'fulfilled') {
      this.customerName.set(customers.value.data.find(item => item.id === order.customerId)?.name ?? '');
    }
    if (!this.customerName() || !this.salespersonName()) {
      this.nameWarning.set('ชื่อบางรายการโหลดไม่ได้ จึงแสดง ID แทน');
    }
  }

  async created(orderId: number): Promise<void> {
    await this.router.navigate(['/orders', orderId], {
      queryParams: { returnTo: this.route.snapshot.queryParamMap.get('returnTo') ?? '/orders' },
      state: { fromOrdersList: (this.location.getState() as { fromOrdersList?: boolean } | null)?.fromOrdersList === true },
      replaceUrl: true,
    });
  }

  goBack(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    const safeReturnTo = returnTo && (returnTo === '/orders' || returnTo.startsWith('/orders?'))
      ? returnTo : '/orders';
    const state = this.location.getState() as { fromOrdersList?: boolean } | null;
    if (state?.fromOrdersList) {
      this.location.back();
    } else {
      // A direct link has no search page in its browser history.
      void this.router.navigateByUrl(safeReturnTo);
    }
  }
}
