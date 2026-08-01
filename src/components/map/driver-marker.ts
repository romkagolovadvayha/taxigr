export const DRIVER_MARKER_WIDTH = 28;
export const DRIVER_MARKER_HEIGHT = 40;

/**
 * Shared transparent map marker used by the browser map and native WebView map.
 * It intentionally has no enclosing badge, background or outer border.
 */
export function driverMarkerSvgMarkup(
  bodyColor = '#FFD600',
  inkColor = '#181818',
): string {
  return `<svg width="${DRIVER_MARKER_WIDTH}" height="${DRIVER_MARKER_HEIGHT}" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.24))">
    <path d="M14 1.5C8.1 1.5 4.5 5.1 4.5 11v18c0 5.9 3.6 9.5 9.5 9.5s9.5-3.6 9.5-9.5V11c0-5.9-3.6-9.5-9.5-9.5Z" fill="${bodyColor}" stroke="${inkColor}" stroke-width="1.5"/>
    <path d="M8 11.4c.5-3.7 2.3-5.6 6-5.6s5.5 1.9 6 5.6l-1.8 4.1H9.8L8 11.4Z" fill="${inkColor}"/>
    <path d="M8.2 27h11.6l-.9 5.2c-.2 1.3-1.3 2.2-2.6 2.2h-4.6c-1.3 0-2.4-.9-2.6-2.2L8.2 27Z" fill="${inkColor}" opacity=".88"/>
    <path d="M7.8 20.8h12.4" stroke="${inkColor}" stroke-width="1.5" stroke-linecap="round" opacity=".45"/>
    <circle cx="8" cy="18.8" r="1.35" fill="${inkColor}"/>
    <circle cx="20" cy="18.8" r="1.35" fill="${inkColor}"/>
  </svg>`;
}
