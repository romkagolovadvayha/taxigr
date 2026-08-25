import { useEffect, useState } from 'react';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AdminAccountsList } from '@/components/admin/admin-accounts-list';
import { demoDriver, demoOrders } from '@/data/demo';
import type { AdminAccountSummary } from '@/domain/models';

type AdminDriverRow = AdminAccountSummary & {
  status: NonNullable<AdminAccountSummary['driverStatus']>;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  colorHex?: string;
  plate?: string;
};

const demoDrivers: AdminAccountSummary[] = [
  {
    id: demoDriver.id,
    userId: 'demo-driver-user',
    name: demoDriver.name,
    phone: demoDriver.phone,
    rating: demoDriver.rating,
    ratingCount: demoDriver.ratingCount ?? 0,
    totalOrders: demoOrders.length,
    completedOrders: demoOrders.filter((order) => order.status === 'completed').length,
    grossMinor: demoOrders
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + order.priceMinor, 0),
    createdAt: demoOrders.at(-1)?.createdAt ?? new Date().toISOString(),
    lastOrderAt: demoOrders[0]?.createdAt,
    driverStatus: 'online',
    commissionBps: 1200,
    hasChildSeat: true,
    vehicle: {
      ...demoDriver.vehicle,
      year: 2021,
    },
  },
];

export function DriversScreen() {
  const { token } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [drivers, setDrivers] = useState<AdminAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (demo) {
      const timer = setTimeout(() => {
        setDrivers(demoDrivers);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!token) return;
    const controller = new AbortController();
    void apiRequest<AdminDriverRow[]>('/v1/admin/drivers', {
      token,
      signal: controller.signal,
    })
      .then((items) => {
        setDrivers(
          items.map((item) => ({
            ...item,
            driverStatus: item.status,
            vehicle:
              item.make && item.model && item.year && item.color && item.colorHex && item.plate
                ? {
                    make: item.make,
                    model: item.model,
                    year: Number(item.year),
                    color: item.color,
                    colorHex: item.colorHex,
                    plate: item.plate,
                  }
                : undefined,
          })),
        );
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить водителей');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [demo, token]);

  return (
    <AdminAccountsList
      kind="drivers"
      title="Водители"
      subtitle="Список водителей, их доступ, рейтинг и результаты поездок"
      items={drivers}
      loading={loading}
      error={error}
    />
  );
}
