import { useState, useRef, useEffect, type ReactNode } from "react";
import { Button, ToggleGroup, ToggleGroupItem, Tooltip } from "@patternfly/react-core";
import { ThIcon, ListAltIcon, MagicIcon, TerminalIcon, SlidersHIcon } from "@patternfly/react-icons";
import { type Layout, LAYOUT_KEY } from "../lib/layout";
import "./LayoutSelector.css";

interface Props {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
}

const LAYOUTS: { key: Layout; icon: ReactNode; label: string }[] = [
  { key: "minimal",   icon: <ThIcon />,       label: "Minimal" },
  { key: "poweruser", icon: <ListAltIcon />,  label: "Power User" },
  { key: "pretty",    icon: <MagicIcon />,    label: "Pretty" },
  { key: "unix",      icon: <TerminalIcon />, label: "Unix" },
];

export function LayoutSelector({ layout, onLayoutChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleChange = (newLayout: Layout) => {
    localStorage.setItem(LAYOUT_KEY, newLayout);
    onLayoutChange(newLayout);
    setOpen(false);
  };

  const current = LAYOUTS.find(l => l.key === layout);

  return (
    <div ref={containerRef} className={`ls-wrap${open ? " ls-wrap--open" : ""}`}>
      <Tooltip content={`Layout: ${current?.label ?? layout}`}>
        <Button
          variant="plain"
          size="sm"
          onClick={() => setOpen(o => !o)}
          aria-label="Change layout"
          className={`ls-trigger${open ? " ls-trigger--active" : ""}`}
        >
          {current?.icon ?? <SlidersHIcon />}
        </Button>
      </Tooltip>
      {open && (
        <ToggleGroup aria-label="Layout" isCompact className="ls-toggle">
          {LAYOUTS.map(({ key, icon, label }) => (
            <Tooltip key={key} content={label}>
              <ToggleGroupItem
                icon={icon}
                isSelected={layout === key}
                onChange={() => handleChange(key)}
                aria-label={label}
              />
            </Tooltip>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
