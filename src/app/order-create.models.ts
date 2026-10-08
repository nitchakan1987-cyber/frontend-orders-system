export interface CreateOrderRequest {
  orderDate: string;
  salespersonId: number;
  customerId: number;
  items: {
    productId: number;
    deliveryDate: string;
    quantity: number;
    unitPrice: string;
  }[];
  freightCharge: string;
  insuranceCharge: string;
}

export interface ProductOption {
  id: number;
  name: string;
  code: string;
}

export interface DraftItem {
  key: number;
  productId: string;
  quantity: number | null;
  deliveryDate: Date | null;
  unitPrice: string;
  priceLoading: boolean;
  priceError: string;
  priceRequest: number;
}
