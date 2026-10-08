import { Component, DestroyRef, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
    MAT_DATE_LOCALE,
    MatDateFormats,
    provideNativeDateAdapter,
} from '@angular/material/core';

import { OrdersApi, DeliveryReportResult } from './orders-api';

const DATE_FORMATS: MatDateFormats = {
    parse: { dateInput: null },
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
    selector: 'app-delivery-report',
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
    templateUrl: './delivery-report.html',
    styleUrls: ['./app.scss', './order-pages.scss'],
})
export class DeliveryReport {
    private readonly api = inject(OrdersApi);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly location = inject(Location);
    private readonly destroyRef = inject(DestroyRef);
    private readonly today = new Date();

    private destroyed = false;

    readonly pageSize = 20;
    readonly currentPage = signal(1);

    readonly totalItems = computed(
        () => this.result()?.data.items.length ?? 0
    );

    readonly totalPages = computed(
        () => Math.ceil(this.totalItems() / this.pageSize)
    );

    readonly pagedItems = computed(() => {
        const items = this.result()?.data.items ?? [];
        const start = (this.currentPage() - 1) * this.pageSize;

        return items.slice(start, start + this.pageSize);
    });

    private applied: {
        deliveryFrom: string;
        deliveryTo: string;
    } | null = null;

    startDateValue: Date | null = new Date(
        this.today.getFullYear(),
        this.today.getMonth(),
        1
    );

    endDateValue: Date | null = new Date(
        this.today.getFullYear(),
        this.today.getMonth() + 1,
        0
    );

    readonly result = signal<DeliveryReportResult | null>(null);
    readonly loading = signal(false);
    readonly exporting = signal<'pdf' | 'xlsx' | null>(null);
    readonly searchSucceeded = signal(false);
    readonly error = signal('');

    constructor() {
        this.destroyRef.onDestroy(() => {
            this.destroyed = true;
        });

        void this.search();
    }

    busy(): boolean {
        return this.loading() || this.exporting() !== null;
    }

    filterChanged(): boolean {
        return this.applied !== null && (
            this.toApiDate(this.startDateValue) !== this.applied.deliveryFrom ||
            this.toApiDate(this.endDateValue) !== this.applied.deliveryTo
        );
    }

    canExport(): boolean {
        return (
            !this.busy() &&
            this.searchSucceeded() &&
            !this.filterChanged() &&
            (this.result()?.data.items.length ?? 0) > 0
        );
    }

    async search(): Promise<void> {
        if (this.busy()) return;

        this.error.set('');
        this.searchSucceeded.set(false);
        this.currentPage.set(1);
        const deliveryFrom = this.toApiDate(this.startDateValue);
        const deliveryTo = this.toApiDate(this.endDateValue);

        if (!deliveryFrom || !deliveryTo) {
            this.error.set('กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด');
            return;
        }

        if (deliveryFrom > deliveryTo) {
            this.error.set('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด');
            return;
        }

        this.loading.set(true);

        try {
            const response = await this.api.deliverySchedule(
                deliveryFrom,
                deliveryTo
            );

            if (this.destroyed) return;

            const items = [...response.data.items].sort((a, b) =>
                a.deliveryDate.localeCompare(b.deliveryDate) ||
                a.orderNo.localeCompare(b.orderNo) ||
                a.productId - b.productId
            );

            this.result.set({
                ...response,
                data: { ...response.data, items },
            });

            this.applied = { deliveryFrom, deliveryTo };
            this.searchSucceeded.set(true);
        } catch (error) {
            const message = await this.errorMessage(error);

            if (!this.destroyed) {
                this.error.set(message);
            }
        } finally {
            if (!this.destroyed) {
                this.loading.set(false);
            }
        }
    }

    changePage(page: number): void {
        if (
            this.busy() ||
            !Number.isInteger(page) ||
            page < 1 ||
            page > this.totalPages()
        ) {
            return;
        }

        this.currentPage.set(page);
    }

    async exportReport(format: 'pdf' | 'xlsx'): Promise<void> {
        if (!this.canExport() || !this.applied) return;

        const filters = { ...this.applied };

        this.exporting.set(format);
        this.error.set('');

        try {
            const blob = await this.api.exportDeliverySchedule(
                filters.deliveryFrom,
                filters.deliveryTo,
                format
            );

            if (this.destroyed) return;
            if (!blob.size) throw new Error('EMPTY_FILE');

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download =
                `delivery-schedule-` +
                `${filters.deliveryFrom.replaceAll('-', '')}-` +
                `${filters.deliveryTo.replaceAll('-', '')}.${format}`;

            document.body.appendChild(link);

            try {
                link.click();
            } finally {
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        } catch (error) {
            const message = await this.errorMessage(error);

            if (!this.destroyed) {
                this.error.set(message);
            }
        } finally {
            if (!this.destroyed) {
                this.exporting.set(null);
            }
        }
    }

    goBack(): void {
        const returnTo = this.route.snapshot.queryParamMap.get('returnTo');

        const safeReturnTo =
            returnTo &&
                (returnTo === '/orders' || returnTo.startsWith('/orders?'))
                ? returnTo
                : '/orders';

        const state = this.location.getState() as {
            fromOrdersList?: boolean;
        } | null;

        if (state?.fromOrdersList) {
            this.location.back();
        } else {
            void this.router.navigateByUrl(safeReturnTo);
        }
    }

    private toApiDate(value: Date | null): string {
        if (!value || Number.isNaN(value.getTime())) return '';

        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    private async errorMessage(error: unknown): Promise<string> {
        if (error instanceof HttpErrorResponse) {
            if (error.status === 401) {
                return 'Token ไม่ถูกต้อง กรุณาตรวจ Token สำหรับทดสอบ';
            }

            if (error.status === 403) {
                return 'ไม่มีสิทธิ์เข้าถึงรายงาน';
            }

            if (error.status === 0) {
                return 'เชื่อมต่อ Backend ไม่ได้';
            }

            let body = error.error;

            // เส้น Export รับ Blob จึงต้องแปลง JSON Error กลับก่อนอ่าน
            if (body instanceof Blob) {
                try {
                    body = JSON.parse(await body.text());
                } catch {
                    return 'โหลดรายงานหรือดาวน์โหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่';
                }
            }

            return body?.error?.message ??
                'โหลดรายงานหรือดาวน์โหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่';
        }

        return 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่';
    }
}