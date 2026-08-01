import type {
  Address,
  AdminMetrics,
  DriverApplication,
  DriverSummary,
  EarningsSummary,
  PassengerSummary,
  RideOrder,
} from '@/domain/models';
import {
  calculateCommissionMinor,
  defaultPricingRules,
} from '@/domain/pricing';

export const grahovoCenter = {
  latitude: 56.04758,
  longitude: 51.95842,
};

export const demoAddresses: Address[] = [
  {
    id: 'grahovo-center',
    label: 'с. Грахово, ул. Ачинцева, 5',
    houseNumber: '5',
    details: 'МФЦ Граховского района',
    coordinates: { latitude: 56.0477, longitude: 51.9586 },
  },
  {
    id: 'grahovo-church',
    label: 'с. Грахово, ул. Колпакова, 1Б',
    houseNumber: '1Б',
    details: 'Христорождественская церковь',
    coordinates: { latitude: 56.04576, longitude: 51.96165 },
  },
  {
    id: 'blagodatnoe',
    label: 'д. Благодатное, ул. Благодатновская, 53А',
    details: 'Граховский район, Удмуртская Республика · точка дома',
    houseNumber: '53А',
    coordinates: { latitude: 55.9995786, longitude: 51.8684492 },
  },
  {
    id: 'mozhga',
    label: 'г. Можга, Привокзальная ул., 6',
    details: 'Железнодорожный вокзал, Удмуртская Республика · точка дома',
    houseNumber: '6',
    coordinates: { latitude: 56.445658, longitude: 52.1972249 },
  },
  {
    id: 'grahovo-50-let-pobedy-19',
    label: 'ул. 50 лет Победы, 19',
    houseNumber: '19',
    details:
      'с. Грахово, Граховский район, Удмуртская Республика · точка дома',
    coordinates: { latitude: 56.055332, longitude: 51.960263 },
  },
];

export const demoDriver: DriverSummary = {
  id: 'driver-demo',
  name: 'Алексей',
  phone: '+7 912 000-12-34',
  rating: 4.96,
  vehicle: {
    make: 'Lada',
    model: 'Granta',
    color: 'Белая',
    colorHex: '#F7F7F2',
    plate: 'А123ВС 18',
  },
  coordinates: { latitude: 56.049, longitude: 51.956 },
};

export const demoPassenger: PassengerSummary = {
  id: 'demo-passenger',
  name: 'Дмитрий',
  phone: '+7 912 000-00-00',
  rating: 4.89,
  ratingCount: 18,
};

const completedPrice = 70_000;

export const demoOrders: RideOrder[] = [
  {
    id: 'ride-history-1',
    passengerId: 'demo-passenger',
    driverId: demoDriver.id,
    pickup: demoAddresses[0]!,
    destination: demoAddresses[2]!,
    tariff: 'economy',
    status: 'completed',
    pricingScope: 'district',
    basePriceMinor: completedPrice,
    priceMinor: completedPrice,
    serviceCommissionMinor: calculateCommissionMinor(completedPrice),
    waitingSeconds: 0,
    waitingPriceMinor: 0,
    waitingFreeMinutes: defaultPricingRules.waitingFreeMinutes,
    waitingPerMinuteMinor: defaultPricingRules.waitingPerMinuteMinor,
    distanceMeters: 11_600,
    durationSeconds: 1_080,
    paymentMethod: 'cash',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 84_900_000).toISOString(),
    driver: demoDriver,
    passenger: demoPassenger,
    ratings: { byPassenger: 5, byDriver: 5 },
  },
  {
    id: 'ride-history-2',
    passengerId: 'demo-passenger',
    driverId: demoDriver.id,
    pickup: demoAddresses[1]!,
    destination: demoAddresses[3]!,
    tariff: 'child',
    status: 'completed',
    pricingScope: 'intercity',
    basePriceMinor: 190_000,
    priceMinor: 191_200,
    serviceCommissionMinor: calculateCommissionMinor(191_200),
    waitingSeconds: 301,
    waitingPriceMinor: 1_200,
    waitingFreeMinutes: defaultPricingRules.waitingFreeMinutes,
    waitingPerMinuteMinor: defaultPricingRules.waitingPerMinuteMinor,
    distanceMeters: 61_000,
    durationSeconds: 4_080,
    paymentMethod: 'cash',
    createdAt: new Date(Date.now() - 604_800_000).toISOString(),
    updatedAt: new Date(Date.now() - 600_000_000).toISOString(),
    driver: demoDriver,
    passenger: demoPassenger,
    ratings: { byPassenger: 5, byDriver: 4 },
  },
];

export const demoApplications: DriverApplication[] = [
  {
    id: 'application-1',
    userId: 'applicant-1',
    applicantName: 'Иван Петров',
    phone: '+7 912 345-67-89',
    licenseNumber: '18 22 123456',
    vehicleMake: 'Renault',
    vehicleModel: 'Logan',
    vehicleYear: 2019,
    vehicleColor: 'Серебристый',
    vehicleColorHex: '#B8BDC4',
    plate: 'В456КМ 18',
    hasChildSeat: true,
    status: 'pending',
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: 'application-2',
    userId: 'applicant-2',
    applicantName: 'Мария Соколова',
    phone: '+7 950 555-12-12',
    licenseNumber: '18 19 654321',
    vehicleMake: 'Lada',
    vehicleModel: 'Vesta',
    vehicleYear: 2021,
    vehicleColor: 'Синяя',
    vehicleColorHex: '#2F6FED',
    plate: 'М777ОР 18',
    hasChildSeat: false,
    status: 'pending',
    createdAt: new Date(Date.now() - 43_200_000).toISOString(),
  },
];

export const demoEarnings: EarningsSummary = {
  period: 'today',
  grossMinor: 486_000,
  commissionMinor: 58_320,
  netMinor: 427_680,
  rides: 9,
  onlineMinutes: 412,
};

export const demoAdminMetrics: AdminMetrics = {
  activeOrders: 3,
  onlineDrivers: 6,
  pendingApplications: demoApplications.length + 1,
  grossTodayMinor: 1_842_000,
  commissionTodayMinor: 221_040,
};
