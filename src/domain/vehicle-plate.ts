/** Only split the civilian format; other plates remain readable as entered. */
export function parseVehiclePlate(plate: string) {
  const normalized = plate.toLocaleUpperCase('ru-RU').replace(/[\s-]/g, '');
  const match = /^([АВЕКМНОРСТУХABEKMHOPCTYX])(\d{3})([АВЕКМНОРСТУХABEKMHOPCTYX]{2})(\d{2,3})$/u.exec(normalized);
  return match ? { prefix: match[1]!, digits: match[2]!, suffix: match[3]!, region: match[4]! } : null;
}
