# Taxi Grahovo — fast portrait motion promo

## Format

- 1080×1920, 30 fps, 29.77 seconds (893 frames), matched to the supplied final voice track.
- Passenger-first story with six beats, not a sequence of website-like screens.
- One large focal object per beat; supporting copy is kept to one short line.
- No persistent header, progress bar, browser chrome, white stripes, or duplicated facts.

## Reference breakdown

| Technique | Reference implementation | Decision |
| --- | --- | --- |
| Object-first composition | SaaS demo keeps one compact control in a large clean field, then lets it become the next state | Adopt: each taxi state grows from the previous hero object |
| Kinetic type | SaaS demo types a short phrase and swaps one emphasized word rather than displaying paragraphs | Adopt: route and CTA are short, large, and animated word-by-word |
| Shape morphing | Futuristic UI turns a pill into a card and then expands the card’s controls | Adopt: order button expands into the driver match; status pill becomes map ETA |
| Progressive numeric motion | Futuristic UI increments percentage inside the same card | Adopt: fare and ETA roll quickly instead of appearing statically |
| Dark/high-contrast stage | Futuristic UI isolates luminous controls on black | Adopt selectively for the driver-match beat; reject as a full-video theme to preserve the taxi brand |
| Compact card reveal | Alight reference grows an app tile from a dot, populates it, then collapses into the next widget | Adopt: cards build from a dot/line and leave through a match-cut |
| Sparse micro UI | All references avoid full application screenshots and animate only the decisive controls | Adopt: no full phone dashboard; only route, tariffs, driver, map, rating, CTA |
| Tiny demo-scale UI | Some reference elements are intentionally miniature | Reject: this promo must remain legible on a phone feed |

## Storyboard

1. **0:00–0:03.5 — Hook.** “Нужно такси? Тогда вы по адресу” types on; a route curve draws at the same time and the large “Начать” button is pressed.
2. **0:03.5–0:07.0 — Order.** A tiny point expands into the route card. Two address fields reveal in a cascade; the CTA grows from an arrow button into “Заказать” and expands into the next scene. Tariff narration is deliberately omitted.
3. **0:07.0–0:11.0 — Match.** Passenger-side search becomes “Водитель найден”, then the Дмитрий / 5.0 / white Lada Vesta / А123АА18 card appears.
4. **0:11.0–0:16.5 — Arrival + trip.** Full-bleed abstract map grows out of the status card. The car follows a curved route; ETA counts 4 → 1 min, then status flips to “В пути” and reaches the school.
5. **0:16.5–0:21.5 — Rating + reviews.** The map becomes a dark circular wipe. Five stars pop sequentially; three review cards move through a centered horizontal carousel.
6. **0:21.5–0:26.5 — Brand close.** A light circular wipe reveals the brand icon. CTA “Заказать такси — просто” appears, followed by Google Play, RuStore, and the site. Final lockup holds for more than one second.

## Voiceover

- Female Russian neural voice (`ru-RU-SvetlanaNeural`), +30% rate, −2 Hz pitch.
- Six scene-local clips with no semantic spill into the next scene.
- Voice normalized near −16 LUFS before the mix; music and SFX are ducked under narration.

## Motion language

- Primary entrances: 10–16 frame overshoot springs.
- Scene-changing morphs: 14–22 frames with one shared shape or color.
- Micro motion: rolling numbers, star pops, route draw, car pitch, button press, notification accept.
- Parallax is limited to background map blocks and review neighbors; it supports depth without reducing readability.
- All animation is frame-driven in Remotion; no CSS animation or transition.

## Visual rules

- Brand yellow `#FFD600`, ink `#181818`, warm canvas `#F4F4F2`, success `#18A957`.
- Key type 76–128 px; supporting type 34–48 px.
- Cards have no decorative outer borders. Separation comes from scale, color, and soft shadow.
- No driver wallet/income sequence: it is not part of the passenger’s essential case.
- Store badges are secondary and appear only in the final lockup.
