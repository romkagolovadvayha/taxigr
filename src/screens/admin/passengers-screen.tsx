import { useEffect, useState } from 'react';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AdminAccountsList } from '@/components/admin/admin-accounts-list';
import { demoOrders, demoPassenger } from '@/data/demo';
import type { AdminAccountSummary } from '@/domain/models';

const demoPassengers: AdminAccountSummary[] = [
  {
    id: demoPassenger.id,
    userId: demoPassenger.id,
    name: demoPassenger.name,
    phone: demoPassenger.phone,
    rating: demoPassenger.rating,
    ratingCount: demoPassenger.ratingCount,
    totalOrders: demoOrders.length,
    completedOrders: demoOrders.filter((order) => order.status === 'completed').length,
    grossMinor: demoOrders
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + order.priceMinor, 0),
    createdAt: demoOrders.at(-1)?.createdAt ?? new Date().toISOString(),
    lastOrderAt: demoOrders[0]?.createdAt,
  },
];

export function PassengersScreen() {
  const { token } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [passengers, setPassengers] = useState<AdminAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (demo) {
      const timer = setTimeout(() => {
        setPassengers(demoPassengers);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!token) return;
    const controller = new AbortController();
    void apiRequest<AdminAccountSummary[]>('/v1/admin/passengers', {
      token,
      signal: controller.signal,
    })
      .then((items) => {
        setPassengers(items);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить пассажиров');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [demo, token]);

  return (
    <AdminAccountsList
      kind="passengers"
      title="Пассажиры"
      subtitle="Профили пассажиров, поездки, оценки и ограничения доступа"
      items={passengers}
      loading={loading}
      error={error}
    />
  );
}
