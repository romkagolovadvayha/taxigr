# Extractable components

## BrandMark
- Source: `src/components/brand-mark.tsx`
- Category: layout
- Description: Original yellow taxi mark with two location pins, a thin dashed route and optional name.
- Extractable props: `compact`, `size`
- Hardcoded: logo paths, brand name, brand tokens

## PassengerNav
- Source: `src/screens/passenger/order-screen.tsx`
- Category: layout
- Description: Orders/profile navigation used in phone top row and desktop rail.
- Extractable props: `vertical`
- Hardcoded: icon names and labels

## AddressFields
- Source: `src/components/passenger/address-fields.tsx`
- Category: basic
- Description: Pickup and destination rows with current-location shortcut.
- Extractable props: pickup/destination labels and loading state
- Hardcoded: markers, labels, row geometry

## TariffSelector
- Source: `src/components/passenger/tariff-selector.tsx`
- Category: basic
- Description: Two-card tariff selector for Economy and Child.
- Extractable props: selected tariff, ETA and prices
- Hardcoded: card structure and icon mapping

## ActiveRidePanel
- Source: `src/components/passenger/active-ride-panel.tsx`
- Category: basic
- Description: Current ride status, driver card and ride actions.
- Extractable props: status, price, driver and action visibility
- Hardcoded: status hierarchy and card styling

## AppButton
- Source: `src/components/ui/app-button.tsx`
- Category: basic
- Description: Shared 56 px action with primary/secondary/quiet/danger variants.
- Extractable props: variant, loading, disabled
- Hardcoded: tokens, haptic behavior, pressed scale
