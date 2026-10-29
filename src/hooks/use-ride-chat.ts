import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { ApiError, apiRequest, getSocketUrl } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import type {
  RideChatImageMimeType,
  RideChatMessage,
  RideChatThread,
  RideOrder,
} from '@/domain/models';
import { canSendRideChatMessage, mergeRideChatSnapshot, upsertRideChatMessage } from '@/domain/ride-chat';
import { useForegroundScreen } from './use-foreground-screen';

export type RideChatImageUpload = {
  base64: string;
  mimeType: RideChatImageMimeType;
  width?: number;
  height?: number;
  fileName?: string;
};

type ChatSession = {
  orderId: string;
  token: string;
  received: RideChatMessage[];
  status?: RideOrder['status'];
  request?: AbortController;
};

export function useRideChat(orderId: string | undefined) {
  const visible = useForegroundScreen();
  const sendInFlight = useRef(false);
  const session = useRef<ChatSession | null>(null);
  const { token } = useSession();
  const [thread, setThread] = useState<RideChatThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const active = session.current;
    if (!active) return;
    active.request?.abort();
    const controller = new AbortController();
    active.request = controller;
    // Only events newer than this snapshot request may override its status.
    active.status = undefined;
    const isCurrent = () => session.current === active && active.request === controller && !controller.signal.aborted;
    setLoading(true);
    try {
      const result = await apiRequest<RideChatThread>(`/v1/orders/${active.orderId}/messages`, {
        token: active.token,
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!isCurrent()) return;
      setThread((current) => mergeRideChatSnapshot(result, current, active.received, active.status));
      setError(null);
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить чат');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !token || token.startsWith('demo:') || !orderId) return;

    const active: ChatSession = { orderId, token, received: [] };
    session.current = active;
    void reload();
    const socketUrl = getSocketUrl();
    const socket: Socket | undefined = socketUrl ? io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 8_000,
    }) : undefined;
    const handleConnect = () => {
      setConnected(true);
      // Resync after subscription to cover messages sent before it connected.
      void reload();
    };
    const handleDisconnect = () => setConnected(false);
    const handleMessage = (message: RideChatMessage) => {
      if (message.orderId !== orderId) return;
      active.received = upsertRideChatMessage(active.received, message);
      setThread((current) => current?.orderId === orderId
        ? { ...current, messages: upsertRideChatMessage(current.messages, message) }
        : current);
    };
    const handleOrderUpdate = (order: RideOrder) => {
      if (order.id !== orderId) return;
      active.status = order.status;
      setThread((current) => current?.orderId === orderId
        ? {
            ...current,
            orderStatus: order.status,
            canSend:
              current.viewerRole !== 'admin' &&
              canSendRideChatMessage(order.status),
          }
        : current);
    };

    socket?.on('connect', handleConnect);
    socket?.on('disconnect', handleDisconnect);
    socket?.on('ride-chat:message', handleMessage);
    socket?.on('order:updated', handleOrderUpdate);

    return () => {
      session.current = null;
      active.request?.abort();
      socket?.off('connect', handleConnect);
      socket?.off('disconnect', handleDisconnect);
      socket?.off('ride-chat:message', handleMessage);
      socket?.off('order:updated', handleOrderUpdate);
      socket?.disconnect();
      handleDisconnect();
    };
  }, [orderId, reload, token, visible]);

  const sendMessage = useCallback(async (
    body: string,
    attachment?: RideChatImageUpload,
  ): Promise<boolean> => {
    const sendingSession = session.current;
    const normalizedBody = body.trim();
    if (
      sendInFlight.current ||
      (!normalizedBody && !attachment) ||
      !token ||
      token.startsWith('demo:') ||
      !orderId ||
      !sendingSession ||
      sendingSession.orderId !== orderId ||
      !thread?.canSend
    ) {
      return false;
    }
    sendInFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const requestBody = JSON.stringify({
        id: randomUUID(),
        body: normalizedBody,
        ...(attachment ? { attachment: { type: 'image' as const, ...attachment } } : {}),
      });
      let message: RideChatMessage | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          message = await apiRequest<RideChatMessage>(`/v1/orders/${orderId}/messages`, {
            method: 'POST',
            token,
            body: requestBody,
            timeoutMs: attachment ? 45_000 : 12_000,
          });
          break;
        } catch (reason) {
          const transient = reason instanceof ApiError &&
            (reason.code === 'NETWORK_ERROR' || reason.code === 'TIMEOUT');
          if (!transient || attempt > 0) throw reason;
        }
      }
      if (!message) throw new ApiError('Не удалось отправить сообщение', 0, 'NETWORK_ERROR');
      if (session.current !== sendingSession) return true;
      const sentMessage = message;
      sendingSession.received = upsertRideChatMessage(sendingSession.received, sentMessage);
      setThread((current) => current?.orderId === orderId
        ? { ...current, messages: upsertRideChatMessage(current.messages, sentMessage) }
        : current);
      return true;
    } catch (reason) {
      if (session.current !== sendingSession) return false;
      const isAttachmentNetworkError = attachment && reason instanceof ApiError &&
        (reason.code === 'NETWORK_ERROR' || reason.code === 'TIMEOUT');
      setError(isAttachmentNetworkError
        ? 'Не удалось загрузить фотографию. Проверьте интернет и повторите отправку'
        : reason instanceof Error
          ? reason.message
          : 'Не удалось отправить сообщение или фотографию');
      return false;
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  }, [orderId, thread?.canSend, token]);

  return {
    thread: thread?.orderId === orderId ? thread : null,
    loading,
    sending,
    connected: visible && connected,
    error: error ?? (token?.startsWith('demo:')
      ? 'Чат доступен после входа в приложение под реальным номером телефона.'
      : null),
    reload,
    sendMessage,
  };
}
