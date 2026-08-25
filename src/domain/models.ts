export type UserRole = 'passenger' | 'driver' | 'admin';
export type DemoPersona = UserRole;

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export const placeCategories = [
  'food',
  'shopping',
  'pharmacy',
  'health',
  'delivery',
  'finance',
  'government',
  'education',
  'culture',
  'sport',
  'auto',
  'services',
  'other',
] as const;

export type PlaceCategory = (typeof placeCategories)[number];
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type OpeningInterval = {
  opensAt: string;
  closesAt: string;
};

export type WeeklySchedule = Record<Weekday, OpeningInterval[]>;

export type PlaceSocialLink = {
  label: string;
  url: string;
};

export type PlaceDirectoryEntry = {
  id: string;
  name: string;
  aliases: string[];
  category: PlaceCategory;
  description?: string;
  addressLabel: string;
  houseNumber?: string;
  coordinates: Coordinates;
  phone?: string;
  website?: string;
  socialLinks: PlaceSocialLink[];
  photoUrls: string[];
  schedule: WeeklySchedule;
  active: boolean;
  sourceName?: string;
  sourceUrl?: string;
  sourceCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Address = {
  id: string;
  label: string;
  details?: string;
  houseNumber?: string;
  placeId?: string;
  place?: PlaceDirectoryEntry;
  coordinates: Coordinates;
};

export type TariffCode = 'economy' | 'child';
export type PaymentMethod = 'direct' | 'cash' | 'transfer';

export type Tariff = {
  code: TariffCode;
  title: string;
  description: string;
  childSeatIncluded: boolean;
  etaMinutes: number;
  priceMinor: number;
};

export type RouteSummary = {
  distanceMeters: number;
  durationSeconds: number;
  source: 'osrm' | 'estimate';
  coordinates: Coordinates[];
};

export type RideStatus =
  | 'draft'
  | 'searching'
  | 'accepted'
  | 'driver_arriving'
  | 'driver_waiting'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type RideOrder = {
  id: string;
  passengerId: string;
  driverId?: string;
  pickup: Address;
  destination: Address;
  tariff: TariffCode;
  status: RideStatus;
  pricingScope?: import('./pricing').PricingScope;
  basePriceMinor?: number;
  searchPriceIncreaseMinor?: number;
  searchPriceIncreaseIntervalMinutes?: number;
  searchPriceIncreaseStepMinor?: number;
  searchPriceIncreaseLastSlot?: number;
  priceMinor: number;
  serviceCommissionMinor: number;
  waitingSeconds?: number;
  waitingPriceMinor?: number;
  waitingStartedAt?: string;
  waitingFreeMinutes?: number;
  waitingPerMinuteMinor?: number;
  distanceMeters: number;
  durationSeconds: number;
  routeCoordinates?: Coordinates[];
  paymentMethod: PaymentMethod;
  paymentConfirmedAt?: string;
  comment?: string;
  cancellationCode?: 'passenger' | 'admin' | 'search_timeout';
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  driver?: DriverSummary;
  passenger?: PassengerSummary;
  ratings?: RideRatings;
  passengerCoordinates?: Coordinates;
};

export type DriverSummary = {
  id: string;
  name: string;
  phone: string;
  rating: number;
  ratingCount?: number;
  vehicle: {
    make: string;
    model: string;
    color: string;
    colorHex: string;
    plate: string;
  };
  coordinates?: Coordinates;
};

export type PassengerSummary = {
  id: string;
  name: string;
  phone?: string;
  rating: number;
  ratingCount: number;
};

export type RideRatings = {
  byPassenger?: number;
  byDriver?: number;
};

export type DriverApplicationStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type DriverApplication = {
  id: string;
  userId: string;
  applicantName: string;
  phone: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  vehicleColorHex: string;
  plate: string;
  hasChildSeat: boolean;
  status: DriverApplicationStatus;
  moderationComment?: string;
  createdAt: string;
};

export type VehicleDetails = {
  make: string;
  model: string;
  year: number;
  color: string;
  colorHex: string;
  plate: string;
};

export type VehicleChangeRequestStatus = 'pending' | 'approved' | 'rejected';

export type VehicleChangeRequest = {
  id: string;
  driverId: string;
  driverName?: string;
  currentVehicle: VehicleDetails;
  proposedVehicle: VehicleDetails;
  currentHasChildSeat: boolean;
  hasChildSeat: boolean;
  status: VehicleChangeRequestStatus;
  moderationComment?: string;
  createdAt: string;
};

export type EarningsSummary = {
  period: 'today' | 'week' | 'month';
  grossMinor: number;
  commissionMinor: number;
  netMinor: number;
  rides: number;
  onlineMinutes: number;
};

export type AdminMetrics = {
  activeOrders: number;
  onlineDrivers: number;
  pendingApplications: number;
  grossTodayMinor: number;
  commissionTodayMinor: number;
};

export type SessionUser = {
  id: string;
  name: string;
  gender?: 'male' | 'female';
  avatarUrl?: string;
  phone?: string;
  profileComplete: boolean;
  roles: UserRole[];
  blockedAt?: string;
  blockReason?: string;
};

export type AdminAccountSummary = {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  avatarUrl?: string;
  rating: number;
  ratingCount: number;
  totalOrders: number;
  completedOrders: number;
  grossMinor: number;
  createdAt: string;
  lastOrderAt?: string;
  blockedAt?: string;
  blockReason?: string;
  driverStatus?: 'online' | 'offline' | 'busy' | 'suspended';
  commissionBps?: number | null;
  hasChildSeat?: boolean;
  vehicle?: VehicleDetails;
};

export type AdminAccountProfile = {
  id: string;
  name: string;
  gender?: 'male' | 'female';
  phone?: string;
  email?: string;
  avatarUrl?: string;
  profileComplete: boolean;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
  blockedAt?: string;
  blockReason?: string;
  blockedByName?: string;
  orderBlockedUntil?: string;
  orderBlockReason?: string;
};

export type AdminAccountStats = {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  grossMinor: number;
  commissionMinor: number;
  averageOrderMinor: number;
  distanceMeters: number;
  rating: number;
  ratingCount: number;
  fiveStarRatings: number;
  onlineMinutes?: number;
  firstOrderAt?: string;
  lastOrderAt?: string;
};

export type AdminActivityPoint = {
  date: string;
  completedOrders: number;
  cancelledOrders: number;
  grossMinor: number;
};

export type AdminRating = {
  id: string;
  orderId: string;
  score: number;
  raterRole: 'passenger' | 'driver';
  rater: { id: string; name: string };
  ratee: { id: string; name: string };
  createdAt: string;
};

export type AdminConsent = {
  documentType: string;
  documentVersion: string;
  source: string;
  acceptedAt: string;
  revokedAt?: string;
};

export type AdminPassengerDetail = {
  kind: 'passenger';
  user: AdminAccountProfile;
  stats: AdminAccountStats;
  activity: AdminActivityPoint[];
  orders: RideOrder[];
  ratings: AdminRating[];
  consents: AdminConsent[];
};

export type AdminDriverDetail = {
  kind: 'driver';
  user: AdminAccountProfile;
  driver: {
    id: string;
    status: 'online' | 'offline' | 'busy' | 'suspended';
    commissionBps: number | null;
    hasChildSeat: boolean;
    approvedAt: string;
    vehicle?: VehicleDetails;
  };
  stats: AdminAccountStats;
  activity: AdminActivityPoint[];
  orders: RideOrder[];
  ratings: AdminRating[];
  consents: AdminConsent[];
  shifts: { id: number; startedAt: string; endedAt?: string; minutes: number }[];
  vehicles: (VehicleDetails & { id: string; active: boolean; createdAt: string })[];
};
