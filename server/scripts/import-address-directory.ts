import { grahovoAddressCatalog, grahovoHouseSnapshot } from '../../src/data/grahovo-address-catalog';
import { db, withTransaction } from '../db';

const points = new Map(grahovoHouseSnapshot.points.map(point => [point.id, point]));
try {
  await withTransaction(async connection => {
    // Re-importing a complete snapshot is atomic and leaves no duplicate rows.
    await connection.query('UPDATE address_directory SET active = FALSE WHERE active = TRUE');
    for (let index = 0; index < grahovoAddressCatalog.length; index += 200) {
      const batch = grahovoAddressCatalog.slice(index, index + 200);
      await connection.query(
        `INSERT INTO address_directory
         (id,label,house_number,coordinate_precision,latitude,longitude,source,source_url,snapshot_date,address_json,active)
         VALUES ? ON DUPLICATE KEY UPDATE label=VALUES(label), house_number=VALUES(house_number),
         coordinate_precision=VALUES(coordinate_precision), latitude=VALUES(latitude), longitude=VALUES(longitude),
         source=VALUES(source), source_url=VALUES(source_url), snapshot_date=VALUES(snapshot_date),
         address_json=VALUES(address_json), active=TRUE`,
        [batch.map(a => { const point = points.get(a.id); return [a.id, a.label, a.houseNumber ?? null,
          a.coordinatePrecision ?? 'approximate', a.coordinates.latitude, a.coordinates.longitude,
          point ? 'osm' : 'gar', point?.sourceUrl ?? 'https://fias.nalog.ru/',
          point ? grahovoHouseSnapshot.dataDate : '2026-08-03', JSON.stringify(a), true]; })],
      );
    }
  });
  console.log(`Imported ${grahovoAddressCatalog.length} addresses, ${points.size} mapped houses.`);
} finally { await db.end(); }
