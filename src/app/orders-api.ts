import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
}