import type { RowDataPacket } from 'mysql2/promise';

import { placeCategoryLabels, placeSearchScore } from '../src/domain/place-directory';
import type {
  Address,
  PlaceCategory,
  PlaceDirectoryEntry,
  PlaceSocialLink,
  WeeklySchedule,
} from '../src/domain/models';
import { db } from './db';

type PlaceRow = RowDataPacket & {
  id: string;
  name: string;
  aliases_json: unknown;
  category: PlaceCategory;
  description: string | null;
  address_label: string;
  house_number: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  social_links_json: unknown;
  photo_urls_json: unknown;
  schedule_json: unknown;
  active: number;
  source_name: string | null;
  source_url: string | null;
  source_checked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const placeSelect = `SELECT id, name, aliases_json, category, description,
  address_label, house_number, latitude, longitude, phone, website,
  social_links_json, photo_urls_json, schedule_json, active,
  source_name, source_url, source_checked_at, created_at, updated_at
  FROM places`;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function isoValue(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

export function presentPlace(row: PlaceRow): PlaceDirectoryEntry {
  return {
    id: row.id,
    name: row.name,
    aliases: parseJson<string[]>(row.aliases_json, []),
    category: row.category,
    description: row.description ?? undefined,
    addressLabel: row.address_label,
    houseNumber: row.house_number ?? undefined,
    coordinates: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    socialLinks: parseJson<PlaceSocialLink[]>(row.social_links_json, []),
    photoUrls: parseJson<string[]>(row.photo_urls_json, []),
    schedule: parseJson<WeeklySchedule>(row.schedule_json, {
      mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
    }),
    active: Boolean(row.active),
    sourceName: row.source_name ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    sourceCheckedAt: isoValue(row.source_checked_at),
    createdAt: isoValue(row.created_at) ?? String(row.created_at),
    updatedAt: isoValue(row.updated_at) ?? String(row.updated_at),
  };
}

export async function listPlaces(includeInactive = false): Promise<PlaceDirectoryEntry[]> {
  const [rows] = await db.query<PlaceRow[]>(
    `${placeSelect}${includeInactive ? '' : ' WHERE active = TRUE'} ORDER BY category, name`,
  );
  return rows.map(presentPlace);
}

export async function findPlace(id: string): Promise<PlaceDirectoryEntry | null> {
  const [rows] = await db.query<PlaceRow[]>(`${placeSelect} WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? presentPlace(rows[0]) : null;
}

export async function searchPlaces(query: string, limit = 12): Promise<PlaceDirectoryEntry[]> {
  const places = await listPlaces(false);
  return places
    .map((place) => ({ place, score: placeSearchScore(place, query) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.place.name.localeCompare(right.place.name, 'ru'))
    .slice(0, limit)
    .map((result) => result.place);
}

export function placeToAddress(place: PlaceDirectoryEntry): Address {
  return {
    id: `place:${place.id}`,
    placeId: place.id,
    label: `${place.name}, с. Грахово, ${place.addressLabel}`,
    details: `${placeCategoryLabels[place.category]} · с. Грахово, ${place.addressLabel}`,
    houseNumber: place.houseNumber,
    kind: 'place',
    coordinates: place.coordinates,
    place,
  };
}
