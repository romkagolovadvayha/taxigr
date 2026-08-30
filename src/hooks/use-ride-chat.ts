import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { apiRequest, getSocketUrl } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import type { RideChatMessage, RideChatThread, RideOrder } from '@/domain/models';
import { canSendRideChatMessage, upsertRideChatMessage } from '@/domain/ride-chat';

export function useRideChat(orderId: string | undefined) {
  const { token } = useSession();
  const [thread, setThread] = useState<RideChatThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!token || token.startsWith('demo:') || !orderId) return;
    const result = await apiRequest<RideChatThread>(`/v1/orders/${orderId}/messages`, {
      token,
      signal,
    });
    setThread(result);
    setError(null);
  }, [orderId, token]);

  useEffect(() => {
    if (!token || token.startsWith('demo:') || !orderId) return;

    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        await reload(controller.signal);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить чат');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [orderId, reload, token]);

  useEffect(() => {
    if (!token || token.startsWith('demo:') || !orderId) return;
    const socketUrl = getSocketUrl();
    if (!socketUrl) return;
    const socket: Socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 8_000,
    });
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleReconnect = () => void reload().catch(() => undefined);
    const handleMessage = (message: RideChatMessage) => {
      if (message.orderId !== orderId) return;
      setThread((current) => current
        ? { ...current, messages: upsertRideChatMessage(current.messages, message) }
        : current);
    };
    const handleOrderUpdate = (order: RideOrder) => {
      if (order.id !== orderId) return;
      setThread((current) => current
        ? {
            ...current,
            orderStatus: order.status,
            canSend: canSendRideChatMessage(order.status),
          }
        : current);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.io.on('reconnect', handleReconnect);
    socket.on('ride-chat:message', handleMessage);
    socket.on('order:updated', handleOrderUpdate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect', handleReconnect);
      socket.off('ride-chat:message', handleMessage);
      socket.off('order:updated', handleOrderUpdate);
      socket.disconnect();
    };
  }, [orderId, reload, token]);

  useEffect(() => {
    if (!token || token.startsWith('demo:') || !orderId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [orderId, reload, token]);

  const sendMessage = useCallback(async (body: string): Promise<boolean> => {
    const normalizedBody = body.trim();
    if (!normalizedBody || !token || token.startsWith('demo:') || !orderId || !thread?.canSend) {
      return false;
    }
    setSending(true);
    setError(null);
    try {
      const message = await apiRequest<RideChatMessage>(`/v1/orders/${orderId}/messages`, {
        method: 'POST',
        token,
        body: JSON.stringify({ id: randomUUID(), body: normalizedBody }),
      });
      setThread((current) => current
        ? { ...current, messages: upsertRideChatMessage(current.messages, message) }
        : current);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отправить сообщение');
      return false;
    } finally {
      setSending(false);
    }
  }, [orderId, thread?.canSend, token]);

  return {
    thread,
    loading,
    sending,
    connected,
    error: error ?? (token?.startsWith('demo:')
      ? 'Чат доступен после входа в приложение под реальным номером телефона.'
      : null),
    reload,
    sendMessage,
  };
}
