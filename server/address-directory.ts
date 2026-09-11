import type { RowDataPacket } from 'mysql2/promise';
import { grahovoAddressCatalog } from '../src/data/grahovo-address-catalog';
import type { Address } from '../src/domain/models';
import { db } from './db';

let loaded: Promise<Address[]> | undefined;

export function getAddressDirectory(): Promise<Address[]> {
  loaded ??= (async () => {
    try {
      const [rows] = await db.query<(RowDataPacket & { address_json: Address | string })[]>(
        'SELECT address_json FROM address_directory WHERE active = TRUE ORDER BY id',
      );
      if (rows.length) {
        const stored = new Map(rows.map(row => {
          const address = typeof row.address_json === 'string' ? JSON.parse(row.address_json) as Address : row.address_json;
          return [address.id, address] as const;
        }));
        const bundledIds = new Set(grahovoAddressCatalog.map(a => a.id));
        // Preserve the familiar street/settlement order in the UI.
        return [...grahovoAddressCatalog.map(a => stored.get(a.id) ?? a),
          ...[...stored.values()].filter(a => !bundledIds.has(a.id))];
      }
    } catch {
      // The bundled catalogue also works before migration and without a database.
    }
    return grahovoAddressCatalog;
  })();
  return loaded;
}
