import { useEffect, useRef, type RefObject } from "react";

const focusableSelector =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';

/** Keep modal keyboard navigation inside the visible dialog and return focus on close. */
export function useDialogFocus(
  open: boolean,
  dialog: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    (
      initialFocus?.current ??
      dialog.current?.querySelector<HTMLElement>(focusableSelector) ??
      dialog.current
    )?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(focusableSelector) ??
          []),
      ].filter((element) => element.getClientRects().length > 0);
      if (!items.length) {
        event.preventDefault();
        dialog.current?.focus();
        return;
      }
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (
        index === -1 ||
        (!event.shiftKey && index === items.length - 1) ||
        (event.shiftKey && index === 0)
      ) {
        event.preventDefault();
        (event.shiftKey ? items.at(-1) : items[0])?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, dialog, initialFocus]);
}
