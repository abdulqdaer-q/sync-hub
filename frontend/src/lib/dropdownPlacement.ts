import { useCallback, useEffect, useState, type RefObject } from "react";

type DropdownDirection = "below" | "above";

type DropdownPlacement = {
  direction: DropdownDirection;
  maxHeight: number;
};

const VIEWPORT_PADDING = 16;
const MENU_GAP = 10;
const MIN_MENU_HEIGHT = 160;

export function useDropdownPlacement<T extends HTMLElement>(
  rootRef: RefObject<T>,
  open: boolean,
  preferredMaxHeight = 280,
) {
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: "below",
    maxHeight: preferredMaxHeight,
  });

  const updatePlacement = useCallback(() => {
    if (!open || typeof window === "undefined" || !rootRef.current) {
      return;
    }

    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const direction: DropdownDirection = spaceBelow < MIN_MENU_HEIGHT && spaceAbove > spaceBelow ? "above" : "below";
    const availableSpace = (direction === "above" ? spaceAbove : spaceBelow) - MENU_GAP;
    const maxHeight = Math.max(120, Math.min(preferredMaxHeight, availableSpace));

    setPlacement((current) =>
      current.direction === direction && Math.abs(current.maxHeight - maxHeight) < 1
        ? current
        : { direction, maxHeight },
    );
  }, [open, preferredMaxHeight, rootRef]);

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    updatePlacement();
    const frame = window.requestAnimationFrame(updatePlacement);

    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  return placement;
}
