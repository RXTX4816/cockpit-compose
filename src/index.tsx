import "./i18n";
import { createRoot } from "react-dom/client";
import "./cockpit-dark-theme";
import "@patternfly/react-core/dist/styles/base.css";
import { App } from "./components/App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
