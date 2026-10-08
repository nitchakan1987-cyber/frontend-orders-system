import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CreateOrderRequest } from './order-create.models';

export interface Salesperson {
  id: number;
  name: string;
}

export interface Customer {
  id: number;
  name: string;
}

export interface Order {
  id: number;
  orderNo: string;
  orderDate: string;
  customerName: string;
  salespersonName: string;
  grandTotal: string;
  deliveryStatus: string;
  version: number;
  actions?: {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
}

export interface OrderResult {
  data: {
    summary: {
      orderCount: number;
      totalAmount: string;
    };
    items: Order[];
  };
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface OrderDetailItem {
  id: number;
  productId: number;
  productCode: string;
  productName: string;
  deliveryDate: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface OrderDetail {
  id: number;
  orderNo: string;
  orderDate: string;
  salespersonId: number;
  customerId: number;
  deliveryStatus: string;
  items: OrderDetailItem[];
  freightCharge: string;
  insuranceCharge: string;
  subtotal: string;
  additionalCharges: string;
  grandTotal: string;
  currency: string;
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  // Token ตัวจริงที่ Backend สำหรับทดสอบ
  private readonly token = 'replace-with-a-long-random-token';

  private get<T>(
    path: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(`/api/v1${path}`, {
        params,
        headers: new HttpHeaders({
          Authorization: `Bearer ${this.token}`
        })
      })
    );
  }

  salespersons() {
    return this.get<{ data: Salesperson[] }>('/salespersons');
  }

  customers(salespersonId: string) {
    const params: Record<string, string> = {};

    if (salespersonId) {
      params['salespersonId'] = salespersonId;
    }

    return this.get<{ data: Customer[] }>('/customers', params);
  }

  orders(params: Record<string, string>) {
    return this.get<OrderResult>('/orders', params);
  }

  orderDetail(orderId: number): Promise<{ data: OrderDetail }> {
    return this.get<{ data: OrderDetail }>(
      `/orders/${orderId}`
    );
  }
  products(): Promise<{ data: unknown[] }> {
    return this.get<{ data: unknown[] }>('/products');
  }

  productPrice(productId: number): Promise<{ data: Record<string, unknown> }> {
    return this.get<{ data: Record<string, unknown> }>(`/products/${productId}/price`);
  }

  createOrder(request: CreateOrderRequest): Promise<{ data: OrderDetail }> {
    return firstValueFrom(
      this.http.post<{ data: OrderDetail }>('/api/v1/orders', request, {
        headers: new HttpHeaders({ Authorization: `Bearer ${this.token}` }),
      })
    );
  }
}