# Final review — voiced fast portrait promo

## Result

PASS after one synchronization correction.

- 1080×1920, 30 fps, 876 frames, 29.2 seconds.
- Female Russian neural voice: `ru-RU-SvetlanaNeural`, rate +30%, pitch −2 Hz.
- First screen: typed “Нужно такси? Тогда вы по адресу”, simultaneous route draw, and synchronized “Начать” press.
- First three phrases stay fully inside their matching scenes with 0.68–0.90 seconds of boundary headroom.
- No pronunciation or stress errors detected in the final narration.
- Final mix: approximately −15.09 LUFS, true peak −0.76 dBTP; no clipping.
- Music sits approximately 9.5–10 dB below narration.
- Music and no-BGM deliverables use identical video packets: `ffb382400482cab09c33f36f021905ec`.

## Independent review correction

The first voiced render allowed narration to spill across the hook, order, and driver scene boundaries. The hook was extended, the tariff and driver copy were shortened, and all downstream scenes/SFX were shifted as a single timeline. The rerender passed the independent synchronization, pronunciation, and balance review.

