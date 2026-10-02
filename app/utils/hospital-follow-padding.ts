import type { PaddingOptions } from "maplibre-gl";

/** Keep a selected route section in the map area uncovered by the cards. */
export function hospitalFollowPadding(container: HTMLElement): PaddingOptions {
  const map = container.getBoundingClientRect();
  const document = container.ownerDocument;
  if (map.width >= 768) {
    const panel = document
      .querySelector('[data-testid="hospital-desktop-preview"]')
      ?.getBoundingClientRect();
    return {
      top: 100,
      bottom: 60,
      left: panel?.width ? Math.max(48, panel.right - map.left + 40) : 440,
      right: 60,
    };
  }
  const topCard = container
    .querySelector('[aria-label="Current direction"]')
    ?.getBoundingClientRect();
  const floorChip = container
    .querySelector('[data-testid="mobile-route-floor"]')
    ?.getBoundingClientRect();
  const top = topCard?.height ? topCard.bottom - map.top + 28 : 180;
  const bottom = floorChip?.height ? map.bottom - floorChip.top + 28 : 240;
  // Leave enough space even when long instruction/department names wrap on
  // a short phone. Unequal padding centres the camera between the cards.
  const scale = Math.min(1, Math.max(0, map.height - 100) / (top + bottom));
  return { top: top * scale, bottom: bottom * scale, left: 32, right: 32 };
}
