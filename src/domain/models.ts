export type UserRole = 'passenger' | 'driver' | 'admin';
export type DemoPersona = UserRole;

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type Address = {
  id: string;
  label: string;
  details?: string;
  houseNumber?: string;
  coordinates: Coordinates;
};

export type TariffCode = 'economy' | 'child';

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
  paymentMethod: 'direct' | 'cash' | 'transfer';
  comment?: string;
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
};
