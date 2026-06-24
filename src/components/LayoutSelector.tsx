import { LayoutSelector as BaseLayoutSelector, type LayoutOption } from "@rxtx4816/cockpit-plugin-base-react/components";
import { ThIcon, ListAltIcon, MagicIcon, TerminalIcon } from "@patternfly/react-icons";
import { type Layout } from "../lib/layout";

const LAYOUTS: LayoutOption<Layout>[] = [
  { key: "minimal",   icon: <ThIcon />,       label: "Minimal" },
  { key: "poweruser", icon: <ListAltIcon />,  label: "Power User" },
  { key: "pretty",    icon: <MagicIcon />,    label: "Pretty" },
  { key: "unix",      icon: <TerminalIcon />, label: "Unix" },
];

interface Props {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
}

export function LayoutSelector({ layout, onLayoutChange }: Props) {
  return <BaseLayoutSelector layout={layout} onLayoutChange={onLayoutChange} layouts={LAYOUTS} />;
}
