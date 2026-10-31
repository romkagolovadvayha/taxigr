export type BroadcastImage = { base64: string; mimeType: 'image/jpeg' | 'image/png' };
export type BroadcastCampaign = {
  id: string; title: string; text: string; revision: number; launched: boolean;
  hasImage: boolean; updatedAt: string; image?: BroadcastImage | null;
};
export type BroadcastRun = {
  id: string; campaignId: string; title: string; revision: number; mode: 'test' | 'all';
  status: 'queued' | 'sending' | 'completed' | 'cancelled' | 'failed';
  total: number; sent: number; skipped: number; failed: number; pending: number;
  createdAt: string; finishedAt: string | null; lastError: string | null;
};
export type BroadcastState = {
  communities: { key: string; id: string; name: string; configured: boolean }[];
  configured: boolean; communityId: string; adminCount: number;
  audience: { total: number; allowed: number; checked: number };
  sync: { generation: string | null; status: string; stage: string; membersCount: number;
    startedAt: string | null; finishedAt: string | null; lastError: string | null; fresh: boolean };
  campaigns: BroadcastCampaign[]; runs: BroadcastRun[];
};

export function broadcastRunLabel(run: Pick<BroadcastRun, 'status' | 'failed'>): string {
  return { queued: 'В очереди', sending: 'Отправляется',
    completed: run.failed ? 'Завершена с ошибками' : 'Завершена',
    cancelled: 'Остановлена', failed: 'Ошибка отправки' }[run.status];
}

export function isBroadcastActive(status: string) {
  return status === 'queued' || status === 'sending';
}
