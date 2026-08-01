# Page dependency trees

## `/` — Passenger order

Entry: `src/app/index.tsx`

- `src/screens/passenger/order-screen.tsx`
  - `src/components/map/taxi-map.tsx`
    - `src/components/map/native-map-html.ts`
    - `src/components/map/types.ts`
  - `src/components/map/taxi-map.web.tsx`
  - `src/components/brand-mark.tsx`
  - `src/components/passenger/address-fields.tsx`
  - `src/components/passenger/tariff-selector.tsx`
  - `src/components/passenger/active-ride-panel.tsx`
  - `src/components/ui/app-button.tsx`
  - `src/components/ui/app-icon.tsx`
  - `src/components/ui/icon-button.tsx`
  - `src/components/ui/money-value.tsx`
  - `src/hooks/use-responsive-layout.ts`
  - `src/state/ride-provider.tsx`
  - `src/theme/tokens.ts`

## `/address-search`

Entry: `src/app/address-search.tsx`

- `src/screens/passenger/address-search-screen.tsx`
  - `src/components/ui/app-icon.tsx`
  - `src/components/ui/icon-button.tsx`
  - `src/components/ui/screen.tsx`
  - `src/state/ride-provider.tsx`
  - `src/theme/tokens.ts`

## `/driver`

Entry: `src/app/driver/index.tsx`

- `src/screens/driver/driver-home-screen.tsx`
  - `src/components/map/taxi-map.tsx`
  - `src/components/ui/app-button.tsx`
  - `src/components/ui/app-icon.tsx`
  - `src/components/ui/money-value.tsx`
  - `src/components/ui/status-chip.tsx`
  - `src/state/ride-provider.tsx`
  - `src/theme/tokens.ts`

## `/admin`

Entry: `src/app/admin/index.tsx`

- `src/screens/admin/admin-dashboard-screen.tsx`
- `src/components/admin/admin-shell.tsx`
- `src/components/ui/*`
- `src/theme/tokens.ts`

The target for the current redesign is the phone render branch of
`src/screens/passenger/order-screen.tsx`; tablet and desktop branches must retain
their persistent side-panel behavior without internal scroll for the normal state.
