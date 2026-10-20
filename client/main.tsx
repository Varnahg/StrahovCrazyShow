import { createRoot } from "react-dom/client";
import { App } from "./ui";
import "./style.css";
import { sessionDiagnostics } from "./session-diagnostics";
// Local diagnostics start with the page, including failures before game startup.
sessionDiagnostics.start();
if (import.meta.hot)
  import.meta.hot.dispose(() => sessionDiagnostics.dispose());
createRoot(document.getElementById("root")!).render(<App />);
