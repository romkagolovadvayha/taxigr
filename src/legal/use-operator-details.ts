import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/api/client';
import type { OperatorDetails } from '@/domain/operator-details';
import { areOperatorDetailsReady, defaultOperatorDetails, presentOperatorDetails } from '@/legal/operator';

export const operatorDetailsQueryKey = ['operator-details'] as const;

export function useOperatorDetails() {
  const query = useQuery({
    queryKey: operatorDetailsQueryKey,
    queryFn: ({ signal }) => apiRequest<OperatorDetails>('/v1/operator-details', { signal }),
    staleTime: 0,
  });
  const details = query.data ?? defaultOperatorDetails;
  return {
    ...query,
    details,
    operatorDetails: presentOperatorDetails(details),
    operatorDetailsReady: areOperatorDetailsReady(details),
  };
}
