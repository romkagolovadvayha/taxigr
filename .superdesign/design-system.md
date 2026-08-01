# Такси Грахово — design system

## Product context

«Такси Грахово» — локальный сервис заказа поездок для жителей и водителей села
Грахово и Граховского района. Поездка может заканчиваться в любой точке, но
подача, коммуникация и доступность водителей ориентированы на Грахово.

Primary jobs:

- пассажир быстро указывает подачу и назначение, видит окончательную оценку цены,
  выбирает тариф и заказывает машину;
- водитель выходит на линию, принимает подходящий заказ, проходит все статусы
  поездки и понимает доход, комиссию и сумму к выплате;
- суперадмин проверяет заявки водителей, управляет доступом, тарифами,
  комиссией и спорными заказами.

## Information architecture

Passenger:

1. Welcome / VK ID sign-in.
2. Order map: pickup, destination, saved places, quote.
3. Tariff selection: «Эконом» and «Детский»; child seat is guaranteed but its
   exact type is not selected.
4. Order options: comment, entrance, phone contact, cash/card placeholder.
5. Searching, driver assigned, driver arriving, waiting, in trip, completed,
   cancelled.
6. Orders history and order details.
7. Profile, notification and privacy settings.
8. Driver application entry point.

Driver:

1. Application form and moderation status.
2. Online/offline home with map and demand state.
3. Incoming offer with pickup distance, route, fare and acceptance timer.
4. Active order: drive to pickup, arrived, passenger onboard, finish.
5. Earnings dashboard: gross, service commission, net, trips and period filters.
6. Documents, car details, shift history and support.

Superadmin:

1. Responsive web dashboard with KPI cards.
2. Driver applications queue and document review.
3. Drivers list, status, personal commission override and suspension.
4. Orders monitor and order detail timeline.
5. Global tariff settings and service commission.
6. Audit log and operational settings.

## Brand direction

The style is inspired by the supplied taxi-app references: calm white surfaces,
large rounded bottom sheets, a map-led experience, compact black typography and a
single confident yellow action color. It must not reproduce Yandex branding,
logos, proprietary illustrations or ad surfaces.

Brand name: «Такси Грахово».

Brand mark concept: an original rounded-square yellow icon containing two black
location pins connected by a thin curved dashed route. The route sits behind the
pins with clean terminations and no overlaps. The mark must remain legible at 32 px.

Voice: plain, neighborly, dependable. Short Russian labels. No corporate jargon.

## Color tokens

- `brand.yellow`: #FFD600
- `brand.yellowPressed`: #E9C400
- `ink.primary`: #181818
- `ink.secondary`: #6F706F
- `ink.muted`: #A8AAA8
- `surface.canvas`: #F4F4F2
- `surface.primary`: #FFFFFF
- `surface.secondary`: #ECEDEB
- `surface.raised`: rgba(255,255,255,0.94)
- `border.subtle`: rgba(24,24,24,0.08)
- `success`: #18A957
- `warning`: #F59E0B
- `danger`: #E5484D
- `info`: #2684FF
- `map.route`: #16B96B
- `map.pickup`: #181818
- `map.destination`: #FFD600

No gradients in functional UI. Avoid decorative colors except semantic states.
Dark mode is optional after launch; light mode is the production baseline.

## Typography

Use system sans-serif for speed and native fidelity:

- iOS: SF Pro through the system font.
- Android: Roboto through the system font.
- Web: Inter variable if locally bundled, then system-ui fallback.

Scale:

- Display: 40/44, weight 800, tracking -1.2.
- Page title: 28/34, weight 750.
- Section title: 20/26, weight 700.
- Body strong: 17/22, weight 650.
- Body: 16/22, weight 450.
- Caption: 13/17, weight 500.
- Micro: 11/14, weight 600.
- Money: tabular numerals, 24/28, weight 800.

Sentence case only. Avoid all caps except tiny operational status chips.

## Spacing and geometry

Base spacing unit: 4 px.

- Screen horizontal inset: 16 mobile, 24 tablet, 32 desktop.
- Common gaps: 8, 12, 16, 20, 24, 32.
- Minimum touch target: 48×48.
- Input height: 56.
- Primary button height: 60 mobile, 56 desktop.
- Bottom-sheet outer radius: 30.
- Card radius: 24.
- Small control radius: 16.
- Capsule radius: 999.
- Dividers: 1 px / hairline using `border.subtle`.

Use continuous corners on native. Shadows stay subtle:
`0 8px 28px rgba(0,0,0,0.10)` only for floating sheets and controls.

## Core components

- `AppButton`: primary yellow, secondary gray, quiet and destructive variants;
  loading, disabled and pressed states.
- `IconButton`: 48×48 circular surface, accessible label required.
- `SurfaceCard`: consistent padding, corner and optional separator.
- `AddressField`: leading pickup/destination symbol, title, optional subtitle,
  clear/reorder action and error state.
- `DestinationHistory`: on an untouched destination search, show up to five
  completed-trip addresses under «Ваши адреса», ordered by trip count and then
  last-used date. The most recently visited address uses a clock icon and
  «последняя · …» metadata; other rows show their trip count.
- `AddressPrecisionNotice`: pickup and destination require a house number.
  Legacy saved rows use warning-soft tokens and «Укажите номер дома». Live
  street suggestions stay neutral because pressing them intentionally refines
  the query instead of selecting an imprecise point.
- `ProgressiveAddressSearch`: partial street fragments produce neutral street
  rows before exact houses. Selecting a street keeps input focus, appends
  `", "` and changes the result section to «Дома на улице»; only exact house
  rows can complete pickup or destination selection.
- `BottomSheetPanel`: responsive mobile sheet; becomes side panel at >= 768 px.
- `TariffCard`: tariff illustration, ETA, title, price and optional badge.
- `TariffIllustration`: a transparent, optimized raster cutout shared by all
  platforms. Economy uses an original white compact taxi with a yellow accent;
  Child uses an original charcoal child seat with a yellow padded insert. The
  compact frames are 52×30 and the non-compact frames are 64×40; the child seat
  stays square inside that frame so both cards preserve the same text geometry.
- `VehicleIllustration`: code-native side-view taxi silhouette filled with the
  approved vehicle HEX color. White vehicles retain a dark outline; every
  passenger, driver and admin surface uses the same illustration.
- `VehicleColorPicker`: a 56 px collapsed field opening an inline, accessible
  grid of common automotive colors with labeled swatches. «Другой цвет» reveals
  a text field and stores a neutral inferred swatch when the exact shade is not
  part of the common palette.
- `DriverMapMarker`: a transparent 38×24 code-native SVG taxi silhouette with
  brand-yellow body, thin dark outline, windows and wheels. It has no enclosing
  badge, background, emoji or outer border; only a subtle SVG drop shadow keeps
  it readable over the map.
- `StatusChip`: operational state with text and icon, never color alone.
- `MoneyValue`: tabular numerals and explicit ₽.
- `RatingBadge`: compact neutral capsule with a filled brand-yellow star and
  two-decimal average; the accessible label also includes the number of ratings.
- `StarRating`: exactly five 31 px vector stars inside 44×44 touch targets;
  selected stars use brand yellow, empty stars use muted ink.
- `RideRatingCard`: shared passenger/driver completion block with participant
  name, current average, `StarRating`, submit and quiet skip actions. It stays
  inside the existing trip sheet instead of opening a full-screen modal.
- `ConsentCheckbox`: full-width neutral card with a 24 px continuous-corner box;
  active state is brand yellow with a custom black vector tick, never a text glyph.
- `EmptyState`, `InlineNotice`, `Skeleton`, `ErrorState`.
- `DataTable`: desktop admin; switches to cards below 900 px.
- `KpiCard`, `FilterBar`, `Timeline`, `DocumentPreview`.

All components consume centralized tokens; no screen-local color constants.

## Passenger ordering screen

Mobile:

- Full-bleed map.
- Top floating row: brand mark/name on the left and profile button on the right.
- Pickup/destination route markers and a green route line. Road geometry stays
  exact, while visible joins receive restrained local rounding so sharp turns
  look softer without cutting across roads or buildings. When routing is ready,
  both markers sit on the rendered line's first and last coordinates; the
  selected address remains the source of truth for labels and order data.
- Route points use compact 24 px circular badges: black/white «А» for pickup and
  yellow/black «Б» for destination, each with a 2 px white outline and subtle shadow.
- Bottom sheet occupies 42–58% of viewport depending on state.
- Two address rows, compact tariff carousel, price note and sticky yellow CTA.
- Pickup attempts the current foreground location once per signed-in session and
  remains empty when permission or a position is unavailable. Destination
  defaults to the latest completed trip without overriding a manual choice.
- Quote and order actions remain disabled until both addresses resolve to a
  specific house; the server repeats the same validation.
- When a driver is assigned, their name includes `RatingBadge`; after completion
  the sheet switches to `RideRatingCard` before offering a new trip.
- Map controls remain above the sheet and clear of safe areas.

Tablet:

- Persistent 390–430 px left order panel and map on the right.
- The panel owns the scroll; CTA remains sticky at its bottom.

Desktop:

- 88 px navigation rail, 420 px order panel, remaining map.
- Maximum content width for forms 420 px.
- Keyboard focus rings visible; hover never replaces pressed/focus states.

## Driver surfaces

Use the same brand and components but prioritize high-contrast operational state:

- online toggle is large and explicit;
- offer cards show pickup first, then destination, fare and estimated route;
- accept button is yellow; decline is quiet;
- active-trip action is a single sticky button whose label advances the state;
- every offer shows the passenger's `RatingBadge` beside their name;
- after completion, the same compact sheet asks the driver to rate the passenger;
- earnings cards show gross, commission and net side by side on tablet/desktop.
- the profile shows the approved vehicle and its real color; changing make,
  model, year, plate, color or child-seat availability creates one moderation
  request. The approved vehicle remains active until an admin accepts it.
- a pending vehicle request compares «Сейчас» and «После одобрения» and blocks
  duplicate requests.

## Admin surfaces

Desktop-first but fully usable on tablet:

- 248 px navigation sidebar and a max-width 1440 px content area;
- neutral white/gray surfaces with yellow only for primary actions and selection;
- dense data uses 14–16 px text, 44 px rows and sticky table headers;
- destructive moderation actions require confirmation and a reason;
- every settings change creates an audit-log entry.
- vehicle-change requests are moderated separately from first-time driver
  applications; approval atomically activates the new vehicle and child-seat
  capability while preserving the previous vehicle for order history.

## Motion and feedback

- Press: 0.98 scale and 120 ms opacity/scale transition.
- Bottom sheet: spring, no overshoot that obscures map controls.
- New driver offer: short haptic pulse and 180 ms slide/fade.
- Order status changes: 220 ms cross-fade plus semantic haptic.
- Respect reduced-motion settings.
- Never animate live vehicle position with long easing; interpolate short updates
  linearly and snap after stale gaps.

## Accessibility and content

- WCAG AA contrast for text and controls.
- Text scaling to 200% without clipping.
- Russian screen-reader labels for every icon-only button and map control.
- Order status is always announced as text.
- Never rely on red/green alone.
- Preserve safe areas and keyboard avoidance on all platforms.
- Network loss shows cached order state and a visible reconnecting banner.

## Performance constraints

- Lazy-load Yandex Maps and heavy admin screens.
- Render the first order panel before map initialization.
- Debounce address suggestions by 300 ms; cancel stale requests.
- Cache recent addresses and current order locally.
- Lists use virtualization; vehicle updates are throttled.
- Keep raster assets small; use code-native SVG for the logo and optimized
  three-density transparent PNG cutouts only for the two tariff illustrations.

## Visual fidelity constraint

Use ONLY the fonts, colors, spacing and component styles defined here. Do not
introduce gradients, decorative serif/cursive fonts, glassmorphism, large hard
shadows, neon colors, advertisements or unrelated super-app services.
