import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { SurfaceCard } from '@/components/ui/surface-card';
import {
  createEmptySchedule,
  getPlaceOpenStatus,
  placeCategoryLabels,
  placeSearchScore,
  weekdayLabels,
  weekdayOrder,
} from '@/domain/place-directory';
import {
  placeCategories,
  type OpeningInterval,
  type PlaceCategory,
  type PlaceDirectoryEntry,
  type PlaceSocialLink,
  type Weekday,
} from '@/domain/models';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type PlaceDraft = {
  name: string;
  aliases: string;
  category: PlaceCategory;
  description: string;
  addressLabel: string;
  houseNumber: string;
  latitude: string;
  longitude: string;
  phone: string;
  website: string;
  socialLinks: string;
  photoUrls: string;
  schedule: Record<Weekday, string>;
  active: boolean;
  sourceName: string;
  sourceUrl: string;
  sourceCheckedAt: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankDraft(): PlaceDraft {
  return {
    name: '',
    aliases: '',
    category: 'shopping',
    description: '',
    addressLabel: '',
    houseNumber: '',
    latitude: '56.045798',
    longitude: '51.960742',
    phone: '',
    website: '',
    socialLinks: '',
    photoUrls: '',
    schedule: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
    active: true,
    sourceName: '',
    sourceUrl: '',
    sourceCheckedAt: today(),
  };
}

function scheduleText(intervals: OpeningInterval[]): string {
  if (intervals.length === 1 && intervals[0]?.opensAt === '00:00' && intervals[0]?.closesAt === '00:00') {
    return '24/7';
  }
  return intervals.map((interval) => `${interval.opensAt}–${interval.closesAt}`).join(', ');
}

function draftFromPlace(place: PlaceDirectoryEntry): PlaceDraft {
  return {
    name: place.name,
    aliases: place.aliases.join(', '),
    category: place.category,
    description: place.description ?? '',
    addressLabel: place.addressLabel,
    houseNumber: place.houseNumber ?? '',
    latitude: String(place.coordinates.latitude),
    longitude: String(place.coordinates.longitude),
    phone: place.phone ?? '',
    website: place.website ?? '',
    socialLinks: place.socialLinks.map((link) => `${link.label} | ${link.url}`).join('\n'),
    photoUrls: place.photoUrls.join('\n'),
    schedule: Object.fromEntries(
      weekdayOrder.map((weekday) => [weekday, scheduleText(place.schedule[weekday])]),
    ) as Record<Weekday, string>,
    active: place.active,
    sourceName: place.sourceName ?? '',
    sourceUrl: place.sourceUrl ?? '',
    sourceCheckedAt: place.sourceCheckedAt?.slice(0, 10) ?? '',
  };
}

function parseScheduleValue(value: string, weekday: Weekday): OpeningInterval[] {
  const normalized = value.trim();
  if (!normalized || /^выходной$/iu.test(normalized)) return [];
  if (/^(?:24\/7|круглосуточно)$/iu.test(normalized)) {
    return [{ opensAt: '00:00', closesAt: '00:00' }];
  }
  return normalized.split(',').map((part) => {
    const match = /^\s*([0-2]\d:[0-5]\d)\s*[–—-]\s*([0-2]\d:[0-5]\d)\s*$/u.exec(part);
    if (!match || Number(match[1]?.slice(0, 2)) > 23 || Number(match[2]?.slice(0, 2)) > 23) {
      throw new Error(`${weekdayLabels[weekday]}: используйте формат 09:00–18:00`);
    }
    return { opensAt: match[1]!, closesAt: match[2]! };
  });
}

function parseSocialLinks(value: string): PlaceSocialLink[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('|');
      if (separator < 0) return { label: 'Ссылка', url: line };
      return { label: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() };
    });
}

function payloadFromDraft(draft: PlaceDraft) {
  const latitude = Number(draft.latitude.replace(',', '.'));
  const longitude = Number(draft.longitude.replace(',', '.'));
  if (!draft.name.trim()) throw new Error('Укажите название');
  if (!draft.addressLabel.trim()) throw new Error('Укажите адрес или понятный ориентир');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Проверьте широту');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Проверьте долготу');
  }
  const schedule = createEmptySchedule();
  for (const weekday of weekdayOrder) {
    schedule[weekday] = parseScheduleValue(draft.schedule[weekday], weekday);
  }
  return {
    name: draft.name.trim(),
    aliases: draft.aliases.split(',').map((alias) => alias.trim()).filter(Boolean),
    category: draft.category,
    description: draft.description.trim() || undefined,
    addressLabel: draft.addressLabel.trim(),
    houseNumber: draft.houseNumber.trim() || undefined,
    coordinates: { latitude, longitude },
    phone: draft.phone.trim() || undefined,
    website: draft.website.trim() || undefined,
    socialLinks: parseSocialLinks(draft.socialLinks),
    photoUrls: draft.photoUrls.split('\n').map((url) => url.trim()).filter(Boolean),
    schedule,
    active: draft.active,
    sourceName: draft.sourceName.trim() || undefined,
    sourceUrl: draft.sourceUrl.trim() || undefined,
    sourceCheckedAt: draft.sourceCheckedAt.trim() || undefined,
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'url' | 'phone-pad';
}) {
  return (
    <View style={{ gap: spacing.x2, flex: 1, minWidth: 220 }}>
      <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={{
          ...typography.body,
          color: colors.ink,
          minHeight: multiline ? 92 : 54,
          textAlignVertical: multiline ? 'top' : 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.x4,
          paddingVertical: multiline ? spacing.x3 : 0,
        }}
      />
    </View>
  );
}

function CategoryButton({
  category,
  selected,
  onPress,
}: {
  category: PlaceCategory;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      accessibilityRole="button"
      aria-pressed={selected}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: spacing.x3,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.ink : colors.border,
        backgroundColor: selected ? colors.surfaceSecondary : colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ ...typography.caption, color: colors.ink }}>{placeCategoryLabels[category]}</Text>
    </AnimatedPressable>
  );
}

export function PlacesScreen() {
  const { token } = useSession();
  const [places, setPlaces] = useState<PlaceDirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PlaceCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlaceDirectoryEntry | null | 'new'>(null);
  const [draft, setDraft] = useState<PlaceDraft>(blankDraft);
  const [deleting, setDeleting] = useState<PlaceDirectoryEntry | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void apiRequest<PlaceDirectoryEntry[]>('/v1/admin/places', { token, signal: controller.signal })
      .then((items) => {
        setPlaces(items);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить справочник');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(
    () =>
      places
        .filter((place) => category === 'all' || place.category === category)
        .filter((place) => !query.trim() || placeSearchScore(place, query) > 0)
        .sort(
          (left, right) =>
            placeCategories.indexOf(left.category) - placeCategories.indexOf(right.category) ||
            left.name.localeCompare(right.name, 'ru'),
        ),
    [category, places, query],
  );
  const grouped = useMemo(
    () =>
      placeCategories
        .map((item) => ({ category: item, places: filtered.filter((place) => place.category === item) }))
        .filter((group) => group.places.length),
    [filtered],
  );

  const openNew = () => {
    setDraft(blankDraft());
    setEditing('new');
    setError(null);
  };

  const openEdit = (place: PlaceDirectoryEntry) => {
    setDraft(draftFromPlace(place));
    setEditing(place);
    setError(null);
  };

  const updateDraft = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!token || !editing) return;
    setBusy(true);
    try {
      const payload = payloadFromDraft(draft);
      const path = editing === 'new' ? '/v1/admin/places' : `/v1/admin/places/${editing.id}`;
      const saved = await apiRequest<PlaceDirectoryEntry>(path, {
        token,
        method: editing === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify(payload),
      });
      setPlaces((current) => {
        const without = current.filter((place) => place.id !== saved.id);
        return [...without, saved];
      });
      setEditing(null);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить место');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!token || !deleting) return;
    setBusy(true);
    try {
      const updated = await apiRequest<PlaceDirectoryEntry>(`/v1/admin/places/${deleting.id}`, {
        token,
        method: 'DELETE',
      });
      setPlaces((current) => current.map((place) => (place.id === updated.id ? updated : place)));
      setDeleting(null);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось скрыть место');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={{ gap: spacing.x6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.x4 }}>
        <View style={{ flex: 1, minWidth: 240 }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Справочник мест
          </Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            {places.length} точек · поиск по названию, псевдонимам и категориям
          </Text>
        </View>
        <AppButton fullWidth={false} style={{ minWidth: 190 }} onPress={openNew}>
          Добавить место
        </AppButton>
      </View>

      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}

      <SurfaceCard>
        <View
          style={{
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.x4,
          }}
        >
          <AppIcon name="search" color={colors.inkSecondary} size={20} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Название, категория или адрес"
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel="Поиск по справочнику"
            style={{ ...typography.body, color: colors.ink, flex: 1, minHeight: 52 }}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
          <AnimatedPressable
            accessibilityRole="button"
            aria-pressed={category === 'all'}
            onPress={() => setCategory('all')}
            style={({ pressed }) => ({
              minHeight: 40,
              justifyContent: 'center',
              paddingHorizontal: spacing.x3,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: category === 'all' ? colors.ink : colors.border,
              backgroundColor: category === 'all' ? colors.surfaceSecondary : colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ ...typography.caption, color: colors.ink }}>Все</Text>
          </AnimatedPressable>
          {placeCategories.map((item) => (
            <CategoryButton
              key={item}
              category={item}
              selected={category === item}
              onPress={() => setCategory(item)}
            />
          ))}
        </View>
      </SurfaceCard>

      {loading ? (
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>Загружаем справочник…</Text>
      ) : !filtered.length ? (
        <SurfaceCard muted>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>Ничего не найдено</Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            Измените запрос или добавьте новое место.
          </Text>
        </SurfaceCard>
      ) : (
        grouped.map((group) => (
          <View key={group.category} style={{ gap: spacing.x3 }}>
            <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
              {placeCategoryLabels[group.category]} · {group.places.length}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
              {group.places.map((place) => {
                const status = getPlaceOpenStatus(place.schedule, now);
                return (
                  <SurfaceCard key={place.id} style={{ flexGrow: 1, flexBasis: 340, maxWidth: 680, minWidth: 280 }}>
                    <View style={{ flexDirection: 'row', gap: spacing.x3 }}>
                      {place.photoUrls[0] ? (
                        <Image
                          source={{ uri: place.photoUrls[0] }}
                          contentFit="cover"
                          accessibilityLabel={`Фото: ${place.name}`}
                          style={{ width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary }}
                        />
                      ) : (
                        <View style={{ width: 72, height: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary }}>
                          <AppIcon name="location" color={colors.inkSecondary} />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0, gap: spacing.x2 }}>
                        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{place.name}</Text>
                        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{place.addressLabel}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
                          <StatusChip
                            label={status.label}
                            tone={status.kind === 'open' ? 'success' : status.kind === 'closed' ? 'neutral' : 'warning'}
                          />
                          {!place.active && <StatusChip label="Скрыто из поиска" tone="danger" />}
                        </View>
                      </View>
                    </View>
                    {!!place.description && <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>{place.description}</Text>}
                    {!!place.phone && <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Телефон: {place.phone}</Text>}
                    {!!place.sourceName && (
                      <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
                        Источник: {place.sourceName}{place.sourceCheckedAt ? ` · проверено ${place.sourceCheckedAt.slice(0, 10)}` : ''}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
                      <AppButton fullWidth={false} variant="secondary" style={{ minWidth: 130, minHeight: 46 }} onPress={() => openEdit(place)}>
                        Изменить
                      </AppButton>
                      {!!place.website && (
                        <AppButton fullWidth={false} variant="quiet" style={{ minWidth: 110, minHeight: 46 }} onPress={() => void Linking.openURL(place.website!)}>
                          Сайт
                        </AppButton>
                      )}
                      {place.active && (
                        <AppButton fullWidth={false} variant="danger" style={{ minWidth: 110, minHeight: 46 }} onPress={() => setDeleting(place)}>
                          Скрыть
                        </AppButton>
                      )}
                    </View>
                  </SurfaceCard>
                );
              })}
            </View>
          </View>
        ))
      )}

      <AppModal
        visible={Boolean(editing)}
        title={editing === 'new' ? 'Новое место' : 'Редактирование места'}
        description="Данные сразу попадут в поиск пассажира. Пустой день считается выходным."
        onClose={() => !busy && setEditing(null)}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.x4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
            <Field label="Название" value={draft.name} onChangeText={(value) => updateDraft('name', value)} placeholder="Караоке-кафе «Максимум»" />
            <Field label="Псевдонимы через запятую" value={draft.aliases} onChangeText={(value) => updateDraft('aliases', value)} placeholder="Maximum, Максимум, караоке" />
          </View>
          <View style={{ gap: spacing.x2 }}>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Категория</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
              {placeCategories.map((item) => (
                <CategoryButton key={item} category={item} selected={draft.category === item} onPress={() => updateDraft('category', item)} />
              ))}
            </View>
          </View>
          <Field label="Описание" value={draft.description} onChangeText={(value) => updateDraft('description', value)} multiline placeholder="Что здесь находится и чем место полезно" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
            <Field label="Адрес или ориентир" value={draft.addressLabel} onChangeText={(value) => updateDraft('addressLabel', value)} placeholder="ул. Дорожная, 13" />
            <Field label="Номер дома" value={draft.houseNumber} onChangeText={(value) => updateDraft('houseNumber', value)} placeholder="13" />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
            <Field label="Широта" value={draft.latitude} onChangeText={(value) => updateDraft('latitude', value)} keyboardType="decimal-pad" />
            <Field label="Долгота" value={draft.longitude} onChangeText={(value) => updateDraft('longitude', value)} keyboardType="decimal-pad" />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
            <Field label="Телефон" value={draft.phone} onChangeText={(value) => updateDraft('phone', value)} keyboardType="phone-pad" />
            <Field label="Сайт" value={draft.website} onChangeText={(value) => updateDraft('website', value)} keyboardType="url" placeholder="https://…" />
          </View>
          <Field label="Соцсети — одна строка: название | URL" value={draft.socialLinks} onChangeText={(value) => updateDraft('socialLinks', value)} multiline placeholder={'ВКонтакте | https://vk.com/…\nTelegram | https://t.me/…'} />
          <Field label="Фото — по одному URL в строке" value={draft.photoUrls} onChangeText={(value) => updateDraft('photoUrls', value)} multiline placeholder="https://…" />

          <View style={{ gap: spacing.x3 }}>
            <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Режим работы</Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              Несколько интервалов разделяйте запятой. Для круглосуточной работы напишите 24/7.
            </Text>
            {weekdayOrder.map((weekday) => (
              <Field
                key={weekday}
                label={weekdayLabels[weekday]}
                value={draft.schedule[weekday]}
                onChangeText={(value) => updateDraft('schedule', { ...draft.schedule, [weekday]: value })}
                placeholder="09:00–13:00, 14:00–18:00"
              />
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
            <Field label="Источник" value={draft.sourceName} onChangeText={(value) => updateDraft('sourceName', value)} placeholder="Официальный сайт" />
            <Field label="URL источника" value={draft.sourceUrl} onChangeText={(value) => updateDraft('sourceUrl', value)} keyboardType="url" placeholder="https://…" />
            <Field label="Дата проверки" value={draft.sourceCheckedAt} onChangeText={(value) => updateDraft('sourceCheckedAt', value)} placeholder="2026-08-25" />
          </View>

          <AnimatedPressable
            accessibilityRole="checkbox"
            aria-checked={draft.active}
            onPress={() => updateDraft('active', !draft.active)}
            style={({ pressed }) => ({
              minHeight: 52,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.x3,
              paddingHorizontal: spacing.x3,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSecondary,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <View style={{ width: 26, height: 26, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.active ? colors.success : colors.surface }}>
              {draft.active && <AppIcon name="check" size={17} color={colors.brandInk} />}
            </View>
            <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Показывать место в поиске пассажира</Text>
          </AnimatedPressable>

          {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
            <AppButton fullWidth={false} loading={busy} style={{ minWidth: 180 }} onPress={() => void save()}>
              Сохранить
            </AppButton>
            <AppButton fullWidth={false} variant="secondary" style={{ minWidth: 130 }} disabled={busy} onPress={() => setEditing(null)}>
              Отмена
            </AppButton>
          </View>
        </ScrollView>
      </AppModal>

      <AppModal
        visible={Boolean(deleting)}
        title="Скрыть место из поиска?"
        description={deleting ? `${deleting.name} останется в справочнике и журнале аудита, но пассажиры его не увидят.` : undefined}
        onClose={() => !busy && setDeleting(null)}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
          <AppButton fullWidth={false} variant="danger" loading={busy} style={{ minWidth: 150 }} onPress={() => void disable()}>
            Скрыть
          </AppButton>
          <AppButton fullWidth={false} variant="secondary" style={{ minWidth: 130 }} disabled={busy} onPress={() => setDeleting(null)}>
            Отмена
          </AppButton>
        </View>
      </AppModal>
    </Screen>
  );
}
