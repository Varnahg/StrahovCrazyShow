import { createRoot } from "react-dom/client";
import { App } from "./ui";
import "./style.css";
import { sessionDiagnostics } from "./session-diagnostics";
import { observeInputModality } from "./input-modality";
// Local diagnostics start with the page, including failures before game startup.
sessionDiagnostics.start();
const stopInputModality = observeInputModality();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    sessionDiagnostics.dispose();
    stopInputModality();
  });
createRoot(document.getElementById("root")!).render(<App />);
