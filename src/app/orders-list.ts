import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MAT_DATE_LOCALE, MatDateFormats, provideNativeDateAdapter } from '@angular/material/core';
import { OrdersApi, Salesperson, Customer, OrderResult, Order } from './orders-api';

function currentMonth() {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { start: `${prefix}-01`, end: `${prefix}-${lastDay}` };
}

const DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: null },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
    monthYearLabel: { month: 'long', year: 'numeric' },
    dateA11yLabel: { day: 'numeric', month: 'long', year: 'numeric' },
    monthYearA11yLabel: { month: 'long', year: 'numeric' },
  },
};

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [provideNativeDateAdapter(DATE_FORMATS), { provide: MAT_DATE_LOCALE, useValue: 'en-GB' }],
  templateUrl: './orders-list.html',
  styleUrls: ['./app.scss', './order-pages.scss'],
})
export class OrdersList {
  private readonly api = inject(OrdersApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly initialMonth = currentMonth();

  startDate = this.initialMonth.start;
  endDate = this.initialMonth.end;
  salespersonId = '';
  customerId = '';
  startDateValue: Date | null = this.toCalendarDate(this.startDate);
  endDateValue: Date | null = this.toCalendarDate(this.endDate);

  readonly salespersons = signal<Salesperson[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly result = signal<OrderResult | null>(null);
  readonly loading = signal(false);
  readonly customersLoading = signal(false);
  readonly mastersReady = signal(false);
  readonly error = signal('');
  readonly filterChanged = signal(false);

  private appliedFilters: Record<string, string> = {};
  private loadRequest = 0;
  private customerRequest = 0;

  constructor() {
    this.destroyRef.onDestroy(() => {
      ++this.loadRequest;
      ++this.customerRequest;
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      void this.restoreAndLoad(params);
    });
  }

  async initialize(): Promise<void> {
    await this.restoreAndLoad(this.route.snapshot.queryParamMap);
  }

  private async restoreAndLoad(params: ParamMap): Promise<void> {
    const request = ++this.loadRequest;
    ++this.customerRequest;
    const month = currentMonth();
    this.startDate = params.get('startDate') ?? month.start;
    this.endDate = params.get('endDate') ?? month.end;
    this.salespersonId = params.get('salespersonId') ?? '';
    this.customerId = params.get('customerId') ?? '';
    this.startDateValue = this.toCalendarDate(this.startDate);
    this.endDateValue = this.toCalendarDate(this.endDate);

    const rawPage = Number(params.get('page') ?? '1');
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    this.error.set('');
    this.filterChanged.set(false);
    this.loading.set(false);
    this.customersLoading.set(false);
    if (!this.validFilters()) return;

    this.loading.set(true);
    this.customersLoading.set(true);
    this.mastersReady.set(false);
    const filters = this.buildFilters();

    try {
      const [sales, customers] = await Promise.all([
        this.api.salespersons(),
        this.api.customers(this.salespersonId),
      ]);
      if (request !== this.loadRequest) return;
      this.salespersons.set(sales.data);
      this.customers.set(customers.data);
      this.mastersReady.set(true);
      this.customersLoading.set(false);

      const response = await this.api.orders({ ...filters, page: String(page), pageSize: '50' });
      if (request !== this.loadRequest) return;
      this.appliedFilters = { ...filters };
      this.result.set(response);
    } catch (error) {
      if (request === this.loadRequest) this.error.set(this.errorMessage(error));
    } finally {
      if (request === this.loadRequest) {
        this.loading.set(false);
        this.customersLoading.set(false);
      }
    }
  }

  setStartDate(value: Date | null): void {
    this.startDateValue = value;
    const next = this.toApiDate(value);
    if (next === this.startDate) return;
    this.startDate = next;
    this.markChanged();
  }

  setEndDate(value: Date | null): void {
    this.endDateValue = value;
    const next = this.toApiDate(value);
    if (next === this.endDate) return;
    this.endDate = next;
    this.markChanged();
  }

  markChanged(): void { this.filterChanged.set(true); }

  async changeSalesperson(): Promise<void> {
    const request = ++this.customerRequest;
    this.customerId = '';
    this.customers.set([]);
    this.customersLoading.set(true);
    this.error.set('');
    this.markChanged();
    try {
      const response = await this.api.customers(this.salespersonId);
      if (request === this.customerRequest) this.customers.set(response.data);
    } catch (error) {
      if (request === this.customerRequest) this.error.set(this.errorMessage(error));
    } finally {
      if (request === this.customerRequest) this.customersLoading.set(false);
    }
  }

  async search(): Promise<void> {
    if (this.loading() || this.customersLoading() || !this.mastersReady()) return;
    if (!this.validFilters()) return;
    await this.navigateSearch(this.buildFilters(), 1);
  }

  async changePage(page: number): Promise<void> {
    const current = this.result();
    if (!current || this.loading() || this.customersLoading() || page < 1 || page > current.meta.totalPages) return;
    await this.navigateSearch(this.appliedFilters, page);
  }

  private async navigateSearch(filters: Record<string, string>, page: number): Promise<void> {
    const tree = this.router.createUrlTree(['/orders'], {
      queryParams: { ...filters, page: String(page), pageSize: '50' },
    });
    // Replace the search URL so Back from the detail returns to this result.
    if (this.router.serializeUrl(tree) === this.router.url) {
      await this.initialize();
    } else {
      await this.router.navigateByUrl(tree, { replaceUrl: true });
    }
  }

  async reset(): Promise<void> {
    const month = currentMonth();
    this.startDate = month.start;
    this.endDate = month.end;
    this.startDateValue = this.toCalendarDate(month.start);
    this.endDateValue = this.toCalendarDate(month.end);
    this.salespersonId = '';
    this.customerId = '';
    await this.changeSalesperson();
    if (!this.error()) await this.search();
  }

  createOrder(): void {
    void this.router.navigate(['/orders/new'], {
      queryParams: { returnTo: this.router.url },
      state: { fromOrdersList: true },
    });
  }

  editOrder(order: Order): void {
    if (!order.actions?.canEdit || order.deliveryStatus !== 'NOT_SHIPPED' || this.loading()) return;
    void this.router.navigate(['/orders', order.id, 'edit'], {
      queryParams: { returnTo: this.router.url },
      state: { fromOrdersList: true },
    });
  }

  viewOrder(order: Order): void {
    if (!order.actions?.canView || this.loading()) return;
    void this.router.navigate(['/orders', order.id], {
      queryParams: { returnTo: this.router.url },
      state: { fromOrdersList: true },
    });
  }

  private buildFilters(): Record<string, string> {
    const filters: Record<string, string> = { startDate: this.startDate, endDate: this.endDate };
    if (this.salespersonId) filters['salespersonId'] = this.salespersonId;
    if (this.customerId) filters['customerId'] = this.customerId;
    return filters;
  }

  private validFilters(): boolean {
    if (!this.toCalendarDate(this.startDate) || !this.toCalendarDate(this.endDate)) {
      this.error.set('กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุดให้ถูกต้อง');
      return false;
    }
    if (this.startDate > this.endDate) {
      this.error.set('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');
      return false;
    }
    if ([this.salespersonId, this.customerId].some(id => id !== '' && (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0))) {
      this.error.set('รหัสลูกค้าหรือเจ้าหน้าที่ขายไม่ถูกต้อง');
      return false;
    }
    return true;
  }

  private toCalendarDate(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return this.toApiDate(date) === value ? date : null;
  }

  private toApiDate(value: Date | null): string {
    if (!value || Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Token ไม่ถูกต้อง กรุณาตรวจ Token สำหรับทดสอบ';
      if (error.status === 0) return 'เชื่อมต่อ Backend ไม่ได้ กรุณาตรวจว่า Go API ทำงานอยู่';
      return error.error?.error?.message ?? 'โหลดข้อมูลไม่สำเร็จ';
    }
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  }
}
