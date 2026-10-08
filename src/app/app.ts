import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  OrdersApi,
  Salesperson,
  Customer,
  OrderResult
} from './orders-api';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MAT_DATE_LOCALE,
  MatDateFormats,
  provideNativeDateAdapter,
} from '@angular/material/core';
function currentMonth() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  return {
    start: `${prefix}-01`,
    end: `${prefix}-${lastDay}`
  };
}
const DATE_FORMATS: MatDateFormats = {
  parse: {
    dateInput: null,
  },
  display: {
    dateInput: {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    },
    monthYearLabel: {
      month: 'long',
      year: 'numeric',
    },
    dateA11yLabel: {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
    monthYearA11yLabel: {
      month: 'long',
      year: 'numeric',
    },
  },
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  providers: [
    provideNativeDateAdapter(DATE_FORMATS),
    { provide: MAT_DATE_LOCALE, useValue: 'en-GB' },
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly api = inject(OrdersApi);
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

  // ใช้กับ Pagination เพื่อไม่เอาตัวกรองที่ยังไม่ได้ค้นหามาปะปน
  private appliedFilters: Record<string, string> = {};
  private customerRequest = 0;

  constructor() {
    void this.initialize();
  }

  async initialize() {
    this.error.set('');
    this.mastersReady.set(false);
    this.customersLoading.set(true);

    try {
      const [sales, customers] = await Promise.all([
        this.api.salespersons(),
        this.api.customers(this.salespersonId)
      ]);

      this.salespersons.set(sales.data);
      this.customers.set(customers.data);
      this.mastersReady.set(true);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.customersLoading.set(false);
    }

    if (this.mastersReady()) {
      await this.search();
    }
  }
  setStartDate(value: Date | null): void {
    this.startDateValue = value;

    const nextDate = this.toApiDate(value);
    if (nextDate === this.startDate) return;

    this.startDate = nextDate;
    this.markChanged();
  }

  setEndDate(value: Date | null): void {
    this.endDateValue = value;

    const nextDate = this.toApiDate(value);
    if (nextDate === this.endDate) return;

    this.endDate = nextDate;
    this.markChanged();
  }

  private toCalendarDate(value: string): Date | null {
    if (!value) return null;

    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private toApiDate(value: Date | null): string {
    if (!value || Number.isNaN(value.getTime())) return '';

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  markChanged() {
    this.filterChanged.set(true);
  }

  async changeSalesperson() {
    const request = ++this.customerRequest;

    this.customerId = '';
    this.customers.set([]);
    this.customersLoading.set(true);
    this.error.set('');
    this.markChanged();

    try {
      const response = await this.api.customers(this.salespersonId);

      if (request !== this.customerRequest) return;

      this.customers.set(response.data);
    } catch (error) {
      if (request === this.customerRequest) {
        this.error.set(this.errorMessage(error));
      }
    } finally {
      if (request === this.customerRequest) {
        this.customersLoading.set(false);
      }
    }
  }

  async search() {
    if (this.loading() || this.customersLoading()) return;

    if (!this.startDate || !this.endDate) {
      this.error.set('กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด');
      return;
    }

    if (this.startDate > this.endDate) {
      this.error.set('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');
      return;
    }

    const filters: Record<string, string> = {
      startDate: this.startDate,
      endDate: this.endDate
    };

    if (this.salespersonId) {
      filters['salespersonId'] = this.salespersonId;
    }

    if (this.customerId) {
      filters['customerId'] = this.customerId;
    }

    await this.loadOrders(filters, 1);
  }

  async changePage(page: number) {
    const current = this.result();

    if (
      !current ||
      this.loading() ||
      page < 1 ||
      page > current.meta.totalPages
    ) return;

    await this.loadOrders(this.appliedFilters, page);
  }

  private async loadOrders(
    filters: Record<string, string>,
    page: number
  ) {
    this.loading.set(true);
    this.error.set('');

    try {
      const response = await this.api.orders({
        ...filters,
        page: String(page),
        pageSize: '50'
      });

      this.appliedFilters = { ...filters };
      this.result.set(response);

      // Pagination อาจเกิดหลังผู้ใช้แก้ตัวกรองแต่ยังไม่ค้นหา
      this.filterChanged.set(
        this.startDate !== filters['startDate'] ||
        this.endDate !== filters['endDate'] ||
        this.salespersonId !== (filters['salespersonId'] ?? '') ||
        this.customerId !== (filters['customerId'] ?? '')
      );
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async reset() {
  const month = currentMonth();

  this.startDate = month.start;
  this.endDate = month.end;

  this.startDateValue = this.toCalendarDate(month.start);
  this.endDateValue = this.toCalendarDate(month.end);

  this.salespersonId = '';
  this.customerId = '';
  this.markChanged();

  await this.changeSalesperson();

  if (!this.error()) {
    await this.search();
  }
}

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        return 'Token ไม่ถูกต้อง กรุณาตรวจ Token สำหรับทดสอบ';
      }

      if (error.status === 0) {
        return 'เชื่อมต่อ Backend ไม่ได้ กรุณาตรวจว่า Go API ทำงานอยู่';
      }

      return error.error?.error?.message ?? 'โหลดข้อมูลไม่สำเร็จ';
    }

    return 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  }
}