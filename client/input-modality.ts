/** Text entry is not keyboard navigation: typing after a click must stay quiet. */
export function observeInputModality(target: Document = document): () => void {
  const root = target.documentElement;
  const previous = root.getAttribute("data-input-modality");
  root.setAttribute("data-input-modality", "pointer");
  const pointer = () => root.setAttribute("data-input-modality", "pointer");
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Tab")
      root.setAttribute("data-input-modality", "keyboard");
  };
  const options = { capture: true };
  target.addEventListener("pointerdown", pointer, options);
  target.addEventListener("keydown", keyboard, options);
  return () => {
    target.removeEventListener("pointerdown", pointer, options);
    target.removeEventListener("keydown", keyboard, options);
    if (previous === null) root.removeAttribute("data-input-modality");
    else root.setAttribute("data-input-modality", previous);
  };
}
