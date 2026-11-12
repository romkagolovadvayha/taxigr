import { config } from './config';

type VkApiResponse<T = unknown> = {
  response?: T;
  error?: { error_msg?: string; error_code?: number };
};

export class VkApiError extends Error {
  constructor(public readonly vkCode: number, message: string) {
    super(message);
    this.name = 'VkApiError';
  }
}

export async function callVkApi<T>(method: string, params: Record<string, string>, token = config.VK_BOT_TOKEN): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.vk.com/method/${method}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...params,
        access_token: token,
        v: config.VK_API_VERSION,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as VkApiResponse<T>;
    if (!response.ok || payload.error || payload.response === undefined) {
      throw new VkApiError(payload.error?.error_code ?? response.status, payload.error?.error_msg ?? `VK API HTTP ${response.status}`);
    }
    return payload.response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function isVkMessagesAllowed(userId: string): Promise<boolean> {
  const result = await callVkApi<{ is_allowed?: number | boolean }>(
    'messages.isMessagesFromGroupAllowed',
    {
      group_id: config.VK_COMMUNITY_ID,
      user_id: userId,
    },
  );
  return result.is_allowed === true || result.is_allowed === 1;
}

export async function sendVkMessage(
  peerId: string,
  input: { message: string; keyboard?: unknown },
): Promise<string | null> {
  const result = await callVkApi<number | {
    message_id?: number;
    conversation_message_id?: number;
  }>('messages.send', {
    peer_id: peerId,
    random_id: '0',
    message: input.message,
    ...(input.keyboard ? { keyboard: JSON.stringify(input.keyboard) } : {}),
  });
  if (typeof result === 'number') return `message:${result}`;
  if (result.conversation_message_id != null) {
    return `conversation:${result.conversation_message_id}`;
  }
  return result.message_id == null ? null : `message:${result.message_id}`;
}

export async function editVkMessage(
  peerId: string,
  trackedMessageId: string,
  input: { message: string; keyboard?: unknown },
): Promise<void> {
  const [kind, messageId] = (/^\d+$/u.test(trackedMessageId) ? `message:${trackedMessageId}` : trackedMessageId).split(':', 2);
  if (!messageId || !kind || !['conversation', 'message'].includes(kind)) throw new Error('Invalid VK message identifier');
  await callVkApi('messages.edit', {
    peer_id: peerId,
    [kind === 'conversation' ? 'conversation_message_id' : 'message_id']: messageId,
    message: input.message,
    keyboard: JSON.stringify(input.keyboard ?? { inline: true, buttons: [] }),
  });
}

export async function deleteVkMessage(
  peerId: string,
  trackedMessageId: string,
): Promise<void> {
  const [kind, messageId] = (/^\d+$/u.test(trackedMessageId) ? `message:${trackedMessageId}` : trackedMessageId).split(':', 2);
  if (!messageId || !kind || !['conversation', 'message'].includes(kind)) throw new Error('Invalid VK message identifier');
  const result = await callVkApi<number | { response?: number }[] | Record<string, number>>('messages.delete', {
    peer_id: peerId,
    [kind === 'conversation' ? 'cmids' : 'message_ids']: messageId,
    delete_for_all: '1',
  });
  const deleted = Array.isArray(result) ? result.some(item => item.response === 1)
    : typeof result === 'object' ? Object.values(result).some(value => value === 1) : result === 1;
  if (!deleted) throw new VkApiError(0, 'VK did not delete the tracked message');
}

export async function answerVkMessageEvent(input: {
  eventId: string;
  userId: string;
  peerId: string;
  text: string;
}): Promise<void> {
  await callVkApi('messages.sendMessageEventAnswer', {
    event_id: input.eventId,
    user_id: input.userId,
    peer_id: input.peerId,
    event_data: JSON.stringify({ type: 'show_snackbar', text: input.text.slice(0, 90) }),
  });
}

export function vkInlineKeyboard(
  rows: ReadonlyArray<ReadonlyArray<{
    type: 'callback' | 'link';
    label: string;
    data?: string;
    url?: string;
    intent?: 'default' | 'positive' | 'negative';
  }>>,
) {
  return {
    inline: true,
    buttons: rows.map((row) => row.map((button) => {
      if (button.type === 'link') {
        return {
          action: {
            type: 'open_link',
            label: button.label,
            link: button.url ?? 'https://taxigr.ru/',
          },
        };
      }
      return {
        action: {
          type: 'callback',
          label: button.label,
          payload: JSON.stringify({ data: button.data ?? '' }),
        },
        color: button.intent === 'positive'
          ? 'positive'
          : button.intent === 'negative'
            ? 'negative'
            : 'primary',
      };
    })),
  };
}
