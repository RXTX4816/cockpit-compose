import "./i18n";
import "@rxtx4816/cockpit-plugin-base-react/dark-theme";
import "@rxtx4816/cockpit-plugin-base-react/log-tokens.css";
import "@patternfly/react-core/dist/styles/base.css";
import { bootstrapPlugin } from "@rxtx4816/cockpit-plugin-base-react/bootstrap";
import { App } from "./components/App";

bootstrapPlugin(App);
