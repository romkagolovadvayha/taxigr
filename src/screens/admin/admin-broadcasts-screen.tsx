import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState, type ComponentProps } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppButton as BaseButton } from '@/components/ui/app-button';
import { AppIcon, type AppIconName } from '@/components/ui/app-icon';
import { SurfaceCard } from '@/components/ui/surface-card';
import { broadcastRunLabel, isBroadcastActive, type BroadcastCampaign, type BroadcastImage, type BroadcastState } from '@/domain/vk-broadcasts';
import { useForegroundScreen } from '@/hooks/use-foreground-screen';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { preparePhoto } from '@/utils/prepare-photo';

const communities = [{ key: 'taxi', name: 'Такси Грахово' }, { key: 'afisha', name: 'Афиша Грахово' }];
function AppButton({ label, icon, ...props }: Omit<ComponentProps<typeof BaseButton>, 'children' | 'icon'> & { label: string; icon?: AppIconName }) {
  return <BaseButton fullWidth={false} compact {...props} style={[{ maxWidth: '100%' }, props.style]}
    icon={icon ? <AppIcon name={icon} size={18} /> : undefined}>{label}</BaseButton>;
}
const formattedDate = (date: string | null) => date ? new Date(date).toLocaleString('ru-RU') : 'Ещё не обновлялась';

export function AdminBroadcastsScreen() {
  const [community, setCommunity] = useState('taxi');
  const colors = useThemeColors();
  return <View style={{ flex: 1 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2, paddingHorizontal: spacing.x6, paddingTop: spacing.x5 }}>
      {communities.map(item => <AppButton key={item.key} label={item.name} variant={community === item.key ? 'primary' : 'secondary'}
        compact onPress={() => setCommunity(item.key)} />)}
    </View>
    <Text style={{ color: colors.inkSecondary, paddingHorizontal: spacing.x6, paddingTop: spacing.x2 }}>
      У каждого сообщества своя аудитория и история рассылок. Сохраните черновик перед переключением.
    </Text>
    <BroadcastWorkspace key={community} community={community} />
  </View>;
}

function BroadcastWorkspace({ community }: { community: string }) {
  const colors = useThemeColors();
  const { token } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const foreground = useForegroundScreen();
  const { isDesktop } = useResponsiveLayout();
  const base = `/v1/admin/broadcasts/${community}`;
  const query = useQuery({ queryKey: ['admin-broadcasts', community, token], enabled: !!token && !demo && foreground,
    queryFn: ({ signal }) => apiRequest<BroadcastState>(base, { token: token!, signal, cache: 'no-store' }),
    refetchInterval: q => foreground && (q.state.data?.sync.status === 'syncing' || q.state.data?.runs.some(r => isBroadcastActive(r.status))) ? 5000 : false,
    refetchIntervalInBackground: false, staleTime: 15_000,
  });
  const [id, setId] = useState(() => Crypto.randomUUID());
  const [revision, setRevision] = useState<number>();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<BroadcastImage | null>(null);
  const [dirty, setDirty] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const runRequest = useRef<{ mode: string; revision: number; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ generation: string; count: number } | null>(null);
  const state = query.data;
  const name = communities.find(c => c.key === community)!.name;
  const request = <T,>(path: string, method = 'POST', body?: unknown) => apiRequest<T>(base + path, {
    token: token!, method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store',
  });
  const perform = async (label: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setError(null); setNotice(null);
    try { await action(); await query.refetch(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось выполнить действие'); }
    finally { busyRef.current = false; setBusy(null); }
  };
  const changed = () => { setDirty(true); setConfirmation(null); runRequest.current = null; };
  const save = async () => {
    if (revision && !dirty) return revision;
    const result = await request<{ revision: number }>(`/campaigns/${id}`, 'PUT', { title, text, image: photo, revision });
    setRevision(result.revision); setDirty(false); return result.revision;
  };
  const selectPhoto = () => perform('photo', async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    const image = result.assets?.[0];
    if (result.canceled || !image) return;
    const prepared = await preparePhoto(image, [{ maxDimension: 1600, compress: 0.85 }, { maxDimension: 1200, compress: 0.7 }], 2_500_000);
    setPhoto({ base64: prepared.base64, mimeType: prepared.mimeType }); changed();
  });
  const start = (mode: 'test' | 'all') => perform(mode, async () => {
    const savedRevision = await save();
    if (!runRequest.current || runRequest.current.mode !== mode || runRequest.current.revision !== savedRevision) {
      runRequest.current = { mode, revision: savedRevision, id: Crypto.randomUUID() };
    }
    await request(`/campaigns/${id}/runs`, 'POST', { ...runRequest.current,
      ...(mode === 'all' && confirmation ? { audienceGeneration: confirmation.generation, expectedCount: confirmation.count } : {}) });
    if (mode === 'all') setLaunched(true);
    setConfirmation(null);
    setNotice(mode === 'test' ? 'Тест поставлен в очередь только администраторам. Результат появится в истории.' : 'Рассылка запущена. Отправка продолжится, даже если закрыть эту страницу.');
  });
  const openDraft = (draftId: string, copy = false) => perform('open', async () => {
    const draft = await request<BroadcastCampaign>(`/campaigns/${draftId}`, 'GET');
    setId(copy ? Crypto.randomUUID() : draft.id); setRevision(copy ? undefined : draft.revision);
    setTitle(copy ? (draft.title + ' — копия').slice(0,120) : draft.title); setText(draft.text); setPhoto(draft.image ?? null);
    setLaunched(copy ? false : draft.launched); setDirty(copy); setConfirmation(null); runRequest.current = null;
  });
  const newDraft = () => {
    setId(Crypto.randomUUID()); setRevision(undefined); setTitle(''); setText(''); setPhoto(null);
    setLaunched(false); setDirty(false); setConfirmation(null); setNotice(null); setError(null); runRequest.current = null;
  };
  const fieldStyle = { ...typography.body, color: colors.ink, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, padding: spacing.x4 };
  const valid = !!title.trim() && !!text.trim() && text.length <= 3500;
  const ready = state?.configured && !demo && !!token;
  const locked = !!busy || launched;
  const audienceReady = state?.sync.fresh;

  return <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ padding: spacing.x6, gap: spacing.x5, paddingBottom: spacing.x10 }} keyboardShouldPersistTaps="handled">
    <View style={{ gap: spacing.x2 }}>
      <Text style={{ ...typography.pageTitle, color: colors.ink }}>Рассылки</Text>
      <Text style={{ ...typography.body, color: colors.inkSecondary }}>Сообщения от сообщества «{name}» во ВКонтакте</Text>
    </View>
    {demo && <Text style={{ color: colors.inkSecondary }}>Войдите в аккаунт администратора, чтобы управлять рассылками.</Text>}
    {query.isLoading && <Text style={{ color: colors.inkSecondary }}>Загружаем рассылки…</Text>}
    {(error || query.error) && <View accessibilityRole="alert" style={{ gap: spacing.x2 }}>
      <Text style={{ color: colors.danger }}>{error || query.error?.message}</Text>
      {query.error && <AppButton label="Повторить загрузку" variant="secondary" onPress={() => void query.refetch()} />}
    </View>}
    {notice && <Text accessibilityRole="alert" style={{ color: colors.ink }}>{notice}</Text>}
    {state && <SurfaceCard>
      <Text style={{ ...typography.sectionTitle, color: colors.ink }}>Аудитория ВК</Text>
      <Text style={{ ...typography.body, color: colors.inkSecondary }}>
        Участники сообщества и люди, которым оно может писать, даже если они ещё не зарегистрированы в такси. Перед каждой отправкой разрешение проверяется заново.
      </Text>
      {!state.configured ? <Text style={{ color: colors.danger }}>Сообщество добавлено. Для отправки требуется подключить его ключ сообщений на сервере.</Text> : <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x6 }}>
          <View><Text style={{ ...typography.pageTitle, color: colors.ink }}>{state.sync.status === 'ready' ? state.audience.allowed : '—'}</Text><Text style={{ color: colors.inkSecondary }}>могут получить сообщение</Text></View>
          <View><Text style={{ ...typography.pageTitle, color: colors.ink }}>{state.sync.membersCount}</Text><Text style={{ color: colors.inkSecondary }}>участников сообщества</Text></View>
          <View><Text style={{ ...typography.pageTitle, color: colors.ink }}>{state.adminCount}</Text><Text style={{ color: colors.inkSecondary }}>администраторов с ВК для теста</Text></View>
        </View>
        <Text style={{ color: colors.inkSecondary }}>{state.sync.status === 'syncing'
          ? `Обновляем аудиторию… Проверено ${state.audience.checked} из ${state.audience.total}`
          : `Обновлено: ${formattedDate(state.sync.finishedAt)}`}</Text>
        {state.sync.lastError && <Text style={{ color: colors.danger }}>{state.sync.lastError}</Text>}
        <AppButton label={state.sync.status === 'syncing' ? 'Аудитория обновляется' : 'Обновить аудиторию'} variant="secondary" compact
          disabled={!!busy || state.sync.status === 'syncing'} loading={busy === 'sync'}
          onPress={() => void perform('sync', async () => { await request('/audience/sync'); })} />
      </>}
    </SurfaceCard>}

    <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.x5, alignItems: 'stretch' }}>
      <View style={{ flex: 1, minWidth: 0 }}><SurfaceCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.x2, alignItems: 'center' }}>
          <Text style={{ ...typography.sectionTitle, color: colors.ink }}>{launched ? 'Отправленная рассылка' : 'Сообщение'}</Text>
          <AppButton label="Новый черновик" variant="quiet" compact disabled={!!busy} onPress={newDraft} />
        </View>
        <Text style={{ color: colors.inkSecondary }}>Название для истории</Text>
        <TextInput accessibilityLabel="Название рассылки" value={title} editable={!locked} maxLength={120} placeholder="Например, новости Такси Грахово"
          placeholderTextColor={colors.inkSecondary} style={fieldStyle} onChangeText={value => { setTitle(value); changed(); }} />
        <Text style={{ color: colors.inkSecondary }}>Текст сообщения</Text>
        <TextInput accessibilityLabel="Текст рассылки" value={text} editable={!locked} multiline maxLength={3500} textAlignVertical="top"
          placeholder="Напишите сообщение для подписчиков…" placeholderTextColor={colors.inkSecondary}
          style={[fieldStyle, { minHeight: 180 }]} onChangeText={value => { setText(value); changed(); }} />
        <Text style={{ color: colors.inkSecondary }}>{text.length} / 3500</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
          <AppButton label={photo ? 'Заменить картинку' : 'Загрузить картинку'} icon="image" variant="secondary" compact disabled={locked} loading={busy === 'photo'} onPress={selectPhoto} />
          {photo && <AppButton label="Убрать картинку" variant="quiet" compact disabled={locked} onPress={() => { setPhoto(null); changed(); }} />}
        </View>
        <Text style={{ color: colors.inkSecondary }}>Картинка необязательна. Большие фотографии уменьшаются автоматически.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
          <AppButton label={dirty ? 'Сохранить черновик' : revision ? 'Черновик сохранён' : 'Сохранить черновик'} variant="secondary" compact
            disabled={!valid || locked || demo || !token || (!!revision && !dirty)} loading={busy === 'save'}
            onPress={() => void perform('save', async () => { await save(); setNotice('Черновик сохранён'); })} />
          <AppButton label="Тест только админам" icon="shield" variant="secondary" fullWidth={!isDesktop} disabled={!valid || locked || !ready || !state?.adminCount}
            loading={busy === 'test'} onPress={() => void start('test')} />
        </View>
        <Text style={{ color: colors.inkSecondary }}>Тест помечается как тестовый. Его получат только администраторы сервиса с привязанным ВК, разрешившие сообщения этого сообщества.</Text>
        {!confirmation ? <AppButton label="Отправить всем получателям" icon="send" fullWidth={!isDesktop} disabled={!valid || locked || !ready || !audienceReady || !state?.audience.allowed}
          onPress={() => void perform('confirm', async () => {
            await save(); const fresh = await query.refetch();
            if (!fresh.data?.sync.generation || fresh.data.sync.status !== 'ready') throw new Error('Сначала обновите аудиторию');
            setConfirmation({ generation: fresh.data.sync.generation, count: fresh.data.audience.allowed });
          })} /> : <View style={{ gap: spacing.x3, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.x4 }}>
          <Text style={{ ...typography.sectionTitle, color: colors.ink }}>Отправить {confirmation.count} получателям?</Text>
          <Text style={{ color: colors.inkSecondary }}>Сообщество: {name}. Проверьте текст и картинку в предпросмотре. Уже отправленные сообщения нельзя отменить.</Text>
          <AppButton label={`Подтверждаю отправку: ${confirmation.count}`} disabled={locked || dirty} loading={busy === 'all'} onPress={() => void start('all')} />
          <AppButton label="Вернуться к редактированию" variant="quiet" disabled={!!busy} onPress={() => setConfirmation(null)} />
        </View>}
        {!audienceReady && ready && <Text style={{ color: colors.inkSecondary }}>Для общей рассылки сначала обновите аудиторию. Результат действителен 24 часа.</Text>}
        {launched && <AppButton label="Создать копию" variant="secondary" disabled={!!busy} onPress={() => void openDraft(id, true)} />}
      </SurfaceCard></View>
      <View style={{ flex: isDesktop ? 0.8 : undefined, minWidth: 0 }}><SurfaceCard>
        <Text style={{ ...typography.sectionTitle, color: colors.ink }}>Предпросмотр</Text>
        <Text style={{ color: colors.inkSecondary }}>Так сообщение увидит получатель</Text>
        <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.x4, gap: spacing.x3 }}>
          <Text style={{ ...typography.sectionTitle, color: colors.ink }}>{name}</Text>
          <Text selectable style={{ ...typography.body, color: text ? colors.ink : colors.inkSecondary }}>{text || 'Здесь появится текст вашего сообщения'}</Text>
          {photo && <Image source={{ uri: `data:${photo.mimeType};base64,${photo.base64}` }} contentFit="contain" accessibilityLabel="Картинка рассылки" style={{ width: '100%', height: 250, borderRadius: radius.md }} />}
          <View style={{ borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.x3 }}><Text style={{ textAlign: 'center', color: colors.ink }}>Заказать такси</Text></View>
        </View>
        <Text style={{ color: colors.inkSecondary }}>Кнопка «Заказать такси» откроет мини-приложение ВК.</Text>
      </SurfaceCard></View>
    </View>
    {!!state?.campaigns.length && <SurfaceCard>
      <Text style={{ ...typography.sectionTitle, color: colors.ink }}>Сохранённые сообщения</Text>
      {state.campaigns.map(c => <View key={c.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.x3 }}>
        <View style={{ flex: 1, minWidth: 170 }}><Text style={{ color: colors.ink, ...typography.body }}>{c.title}</Text><Text style={{ color: colors.inkSecondary }}>{c.launched ? 'Рассылка запущена' : 'Черновик'} · {formattedDate(c.updatedAt)}{c.hasImage ? ' · С картинкой' : ''}</Text></View>
        <AppButton label="Открыть" compact variant="secondary" disabled={!!busy} onPress={() => void openDraft(c.id)} />
        <AppButton label="Копия" compact variant="quiet" disabled={!!busy} onPress={() => void openDraft(c.id, true)} />
      </View>)}
    </SurfaceCard>}
    <SurfaceCard>
      <Text style={{ ...typography.sectionTitle, color: colors.ink }}>История отправок</Text>
      {!state?.runs.length && <Text style={{ color: colors.inkSecondary }}>Отправок пока нет. Начните с теста администраторам.</Text>}
      {state?.runs.map(run => <View key={run.id} style={{ gap: spacing.x2, paddingVertical: spacing.x2 }}>
        <Text style={{ ...typography.body, color: colors.ink }}>{run.mode === 'test' ? 'ТЕСТ · ' : ''}{run.title} — {broadcastRunLabel(run)}</Text>
        <Text style={{ color: colors.inkSecondary }}>{formattedDate(run.createdAt)} · Отправлено {run.sent} из {run.total} · Пропущено {run.skipped} · Ошибок {run.failed}</Text>
        {run.lastError && <Text style={{ color: colors.danger }}>{run.lastError}</Text>}
        {run.skipped > 0 && <Text style={{ color: colors.inkSecondary }}>Пропущены недоступные получатели, запретившие сообщения или утратившие права администратора.</Text>}
        {run.status === 'cancelled' && <Text style={{ color: colors.inkSecondary }}>Не отправлено: {run.pending}. Запрос, уже переданный в ВК до остановки, может завершиться.</Text>}
        {isBroadcastActive(run.status) && <AppButton label="Остановить отправку" variant="danger" compact disabled={!!busy}
          onPress={() => void perform('cancel', async () => { await request(`/runs/${run.id}/cancel`); setNotice('Отправка остановлена. Уже переданный ВК запрос может завершиться.'); })} />}
      </View>)}
    </SurfaceCard>
  </ScrollView>;
}
