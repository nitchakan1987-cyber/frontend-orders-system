import { Component, DestroyRef, Input, OnInit, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MAT_DATE_LOCALE, MatDateFormats, provideNativeDateAdapter } from '@angular/material/core';
import { OrdersApi, Salesperson, Customer, OrderDetail } from './orders-api';
import { CreateOrderRequest, DraftItem, ProductOption } from './order-create.models';
import { decimalMoney, displayMoney, moneyCents, MAX_MONEY_CENTS } from './order-money';
const FORM_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: null },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
    monthYearLabel: { month: 'long', year: 'numeric' },
    dateA11yLabel: { day: 'numeric', month: 'long', year: 'numeric' },
    monthYearA11yLabel: { month: 'long', year: 'numeric' },
  },
};
@Component({
  selector: 'app-order-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [provideNativeDateAdapter(FORM_DATE_FORMATS), { provide: MAT_DATE_LOCALE, useValue: 'en-GB' }],
  templateUrl: './order-form.html',
  styleUrls: ['./app.scss', './order-pages.scss'],
})
export class OrderForm implements OnInit {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() initialOrder: OrderDetail | null = null;
  readonly locked = signal(false);
  private readonly originalPrices = new Map<number, string>();
  private readonly api = inject(OrdersApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly saved = output<number>();
  readonly cancelled = output<void>();
  readonly salespersons = signal<Salesperson[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly products = signal<ProductOption[]>([]);
  readonly items = signal<DraftItem[]>([]);
  readonly mastersLoading = signal(false);
  readonly mastersReady = signal(false);
  readonly customersLoading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<string[]>([]);
  orderDateValue: Date | null = new Date();
  salespersonId = '';
  customerId = '';
  freightCharge = '0.00';
  insuranceCharge = '0.00';
  private nextKey = 0;
  private masterRequest = 0;
  private alive = true;
  private dirty = false;
  private completed = false;
  constructor() {
    this.destroyRef.onDestroy(() => { this.alive = false; ++this.masterRequest; });
  }
  ngOnInit(): void {
    if (this.mode === 'edit') {
      if (!this.initialOrder || this.initialOrder.deliveryStatus !== 'NOT_SHIPPED') {
        this.locked.set(true);
        this.error.set('คำสั่งซื้อนี้แก้ไขไม่ได้');
        return;
      }
      this.fillExistingOrder(this.initialOrder);
    } else {
      this.addItem(false);
    }
    void this.initialize();
  }
  private fillExistingOrder(order: OrderDetail): void {
    this.orderDateValue = this.calendarDate(order.orderDate);
    this.salespersonId = String(order.salespersonId);
    this.customerId = String(order.customerId);
    this.freightCharge = order.freightCharge;
    this.insuranceCharge = order.insuranceCharge;
    this.items.set(order.items.map(item => {
      this.originalPrices.set(item.productId, item.unitPrice);
      return {
        key: ++this.nextKey, productId: String(item.productId), quantity: item.quantity,
        deliveryDate: this.calendarDate(item.deliveryDate), unitPrice: item.unitPrice,
        priceLoading: false, priceError: '', priceRequest: 0,
      };
    }));
    this.dirty = false;
  }
  private calendarDate(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return this.dateString(date) === value ? date : null;
  }
  async initialize(): Promise<void> {
    if (this.saving() || this.locked()) return;
    const request = ++this.masterRequest;
    this.mastersLoading.set(true);
    this.customersLoading.set(true);
    this.mastersReady.set(false);
    this.error.set('');
    try {
      const [sales, products, customers] = await Promise.all([
        this.api.salespersons(),
        this.api.products(),
        this.api.customersAll(),
      ]);
      if (!this.alive || request !== this.masterRequest) return;
      if (!Array.isArray(customers.data)) {
        throw new Error('Response /customers/all ต้องมี data เป็น array');
      }
      this.salespersons.set(sales.data);
      this.products.set(this.productOptions(products.data));
      this.customers.set(customers.data);
      this.mastersReady.set(true);
    } catch (error) {
      if (this.alive && request === this.masterRequest) this.error.set(this.errorMessage(error));
    } finally {
      if (this.alive && request === this.masterRequest) {
        this.mastersLoading.set(false);
        this.customersLoading.set(false);
      }
    }
  }
  private productOptions(data: unknown[]): ProductOption[] {
    if (!Array.isArray(data)) throw new Error('Response /products ต้องมี data เป็น array');
    return data.map(value => {
      const item = value as Record<string, unknown> | null;
      const id = Number(item?.['id'] ?? item?.['productId']);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Response /products ไม่มี id สินค้าที่ถูกต้อง');
      return {
        id,
        name: String(item?.['name'] ?? item?.['productName'] ?? `สินค้า ID ${id}`),
        code: String(item?.['productCode'] ?? item?.['product_code'] ?? item?.['code'] ?? ''),
      };
    });
  }
  markDirty(): void { this.dirty = true; }
  changeSalesperson(): void {
    // Salesperson and customer are independent in Create mode.
    this.markDirty();
  }
  addItem(markDirty = true): void {
    if (this.saving() || this.locked()) return;
    const deliveryDate = this.orderDateValue && !Number.isNaN(this.orderDateValue.getTime())
      ? new Date(this.orderDateValue.getTime()) : null;
    this.items.update(items => [...items, {
      key: ++this.nextKey, productId: '', quantity: 1, deliveryDate,
      unitPrice: '', priceLoading: false, priceError: '', priceRequest: 0,
    }]);
    if (markDirty) this.markDirty();
  }
  removeItem(row: DraftItem): void {
    if (this.saving() || this.locked()) return;
    ++row.priceRequest;
    this.items.update(items => items.filter(item => item.key !== row.key));
    this.markDirty();
  }
  isUsed(productId: number, rowKey: number): boolean {
    return this.items().some(row => row.key !== rowKey && Number(row.productId) === productId);
  }
  async changeProduct(row: DraftItem, value: string): Promise<void> {
    row.productId = value;
    row.unitPrice = '';
    row.priceError = '';
    row.priceLoading = false;
    const request = ++row.priceRequest;
    this.markDirty();
    this.items.update(items => [...items]);
    if (!value) return;
    // Backend UpdateOrder retains the original price for products already in this order.
    const originalPrice = this.originalPrices.get(Number(value));
    if (this.mode === 'edit' && originalPrice !== undefined) {
      row.unitPrice = originalPrice;
      this.items.update(items => [...items]);
      return;
    }
    row.priceLoading = true;
    this.items.update(items => [...items]);
    try {
      const response = await this.api.productPrice(Number(value));
      if (!this.alive || request !== row.priceRequest || !this.items().includes(row)) return;
      const rawPrice = response.data?.['unitPrice'] ?? response.data?.['price'];
      if (typeof rawPrice !== 'string' && typeof rawPrice !== 'number') {
        throw new Error('Response ราคาต้องมี data.unitPrice หรือ data.price');
      }
      const cents = moneyCents(String(rawPrice));
      if (cents === null) throw new Error('ราคาสินค้าไม่ถูกต้อง');
      row.unitPrice = decimalMoney(cents);
    } catch (error) {
      if (this.alive && request === row.priceRequest) row.priceError = this.errorMessage(error);
    } finally {
      if (this.alive && request === row.priceRequest) {
        row.priceLoading = false;
        this.items.update(items => [...items]);
      }
    }
  }
  hasPendingPrices(): boolean { return this.items().some(row => row.priceLoading); }
  lineCents(row: DraftItem): bigint {
    const price = moneyCents(row.unitPrice);
    return price !== null && row.quantity !== null && Number.isInteger(row.quantity) && row.quantity > 0
      && row.quantity <= 2147483647 ? price * BigInt(row.quantity) : 0n;
  }
  subtotal(): string {
    return displayMoney(this.items().reduce((total, row) => total + this.lineCents(row), 0n));
  }
  lineTotal(row: DraftItem): string { return displayMoney(this.lineCents(row)); }
  grandTotal(): string {
    const subtotal = this.items().reduce((total, row) => total + this.lineCents(row), 0n);
    return displayMoney(subtotal + (moneyCents(this.freightCharge) ?? 0n) + (moneyCents(this.insuranceCharge) ?? 0n));
  }
  private dateString(value: Date | null): string {
    if (!value || Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  private buildRequest(): CreateOrderRequest | null {
    const errors: string[] = [];
    const orderDate = this.dateString(this.orderDateValue);
    const freight = moneyCents(this.freightCharge);
    const insurance = moneyCents(this.insuranceCharge);
    if (!orderDate) errors.push('กรุณาเลือกวันที่รับคำสั่งซื้อ');
    if (!this.salespersons().some(item => item.id === Number(this.salespersonId))) errors.push('กรุณาเลือกเจ้าหน้าที่ขาย');
    if (!this.customers().some(item => item.id === Number(this.customerId))) errors.push('กรุณาเลือกลูกค้า');
    if (freight === null) errors.push('ค่าเฟรทต้องเป็นจำนวนเงินที่ไม่ติดลบ');
    if (insurance === null) errors.push('ค่าประกันต้องเป็นจำนวนเงินที่ไม่ติดลบ');
    if (!this.items().length) errors.push('ต้องมีสินค้าอย่างน้อย 1 รายการ');
    const seen = new Set<number>();
    let subtotal = 0n;
    const items = this.items().map((row, index) => {
      const label = `สินค้าแถว ${index + 1}`;
      const productId = Number(row.productId);
      const deliveryDate = this.dateString(row.deliveryDate);
      if (!this.products().some(item => item.id === productId)) errors.push(`${label}: กรุณาเลือกสินค้า`);
      if (seen.has(productId)) errors.push(`${label}: สินค้าซ้ำในใบเดียวกัน`);
      seen.add(productId);
      if (row.quantity === null || !Number.isInteger(row.quantity) || row.quantity <= 0 || row.quantity > 2147483647) errors.push(`${label}: จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 2147483647`);
      if (!deliveryDate || (orderDate && deliveryDate < orderDate)) errors.push(`${label}: กำหนดส่งต้องไม่ก่อนวันที่รับคำสั่งซื้อ`);
      if (row.priceLoading || row.priceError || moneyCents(row.unitPrice) === null) errors.push(`${label}: ต้องโหลดราคาสำเร็จก่อนบันทึก`);
      subtotal += this.lineCents(row);
      return { productId, deliveryDate, quantity: row.quantity ?? 0, unitPrice: row.unitPrice };
    });
    if (subtotal + (freight ?? 0n) + (insurance ?? 0n) > MAX_MONEY_CENTS) errors.push('ยอดรวมเกินจำนวนเงินที่ระบบรองรับ');
    this.fieldErrors.set(errors);
    if (errors.length) return null;
    return { orderDate, salespersonId: Number(this.salespersonId), customerId: Number(this.customerId),
      items, freightCharge: decimalMoney(freight!), insuranceCharge: decimalMoney(insurance!) };
  }
  async submit(): Promise<void> {
    if (this.locked() || this.completed || this.saving() || this.mastersLoading() || !this.mastersReady() || this.customersLoading() || this.hasPendingPrices()) return;
    this.error.set('');
    const request = this.buildRequest();
    if (!request) return;
    this.saving.set(true);
    try {
      // Re-check status on the client; the PUT endpoint must also enforce it atomically.
      if (this.mode === 'edit') {
        if (!this.initialOrder || !await this.checkEditable()) return;
      }
      const response = this.mode === 'edit'
        ? await this.api.updateOrder(this.initialOrder!.id, request)
        : await this.api.createOrder(request);
      if (!this.alive) return;
      if (!Number.isSafeInteger(response.data.id) || response.data.id <= 0) throw new Error('บันทึกแล้ว แต่ response ไม่มี ID คำสั่งซื้อ กรุณาตรวจหน้ารายการก่อนบันทึกซ้ำ');
      this.dirty = false;
      this.completed = true;
      this.saved.emit(response.data.id);
    } catch (error) {
      if (!this.alive) return;
      this.error.set(this.errorMessage(error));
      if (this.mode === 'edit' && error instanceof HttpErrorResponse &&
          (error.status === 409 || /SHIPP|NOT_EDITABLE/.test(String(error.error?.error?.code ?? '')))) {
        try { await this.checkEditable(); } catch { /* Preserve the original PUT error. */ }
      }
      if (error instanceof HttpErrorResponse && Array.isArray(error.error?.error?.fields)) {
        this.fieldErrors.set(error.error.error.fields.map((field: { field: string; message: string }) => `${field.field}: ${field.message}`));
      }
    } finally {
      if (this.alive && !this.completed) this.saving.set(false);
    }
  }
  private async checkEditable(): Promise<boolean> {
    if (!this.initialOrder) return false;
    const latest = await this.api.orderDetail(this.initialOrder.id);
    if (!this.alive) return false;
    if (latest.data.deliveryStatus !== 'NOT_SHIPPED') {
      this.locked.set(true);
      this.error.set('คำสั่งซื้อมีการจัดส่งแล้ว จึงบันทึกการแก้ไขไม่ได้ กรุณากลับไปดูข้อมูลล่าสุด');
      return false;
    }
    return true;
  }
  cancel(): void {
    if (this.saving()) return;
    if (this.dirty && !window.confirm(this.mode === 'edit' ? 'ยกเลิกการแก้ไข? ข้อมูลที่เปลี่ยนยังไม่ได้บันทึก' : 'ยกเลิกการสร้างคำสั่งซื้อ? ข้อมูลที่กรอกยังไม่ได้บันทึก')) return;
    this.cancelled.emit();
  }
  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'เชื่อมต่อ Backend ไม่ได้ หากเกิดตอนบันทึกให้ตรวจหน้ารายการก่อนลองบันทึกซ้ำ';
      if (error.status === 401) return 'Token ไม่ถูกต้อง';
      if (error.status === 403) return 'ไม่มีสิทธิ์บันทึกคำสั่งซื้อให้เจ้าหน้าที่ขายที่เลือก';
      return error.error?.error?.message ?? 'ดำเนินการไม่สำเร็จ';
    }
    return error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  }
}
