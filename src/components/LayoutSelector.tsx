import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem, Tooltip } from "@patternfly/react-core";
import { type Layout, LAYOUT_KEY } from "../lib/layout";

interface Props {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
}

export function LayoutSelector({ layout, onLayoutChange }: Props) {
  const { t } = useTranslation();

  const handleChange = (newLayout: Layout) => {
    if (newLayout === layout) return;
    localStorage.setItem(LAYOUT_KEY, newLayout);
    onLayoutChange(newLayout);
  };

  return (
    <Tooltip content={t("layout.toggle_label")}>
      <ToggleGroup aria-label={t("layout.toggle_label")} isCompact>
        <ToggleGroupItem
          text={t("layout.minimal")}
          isSelected={layout === "minimal"}
          onChange={() => handleChange("minimal")}
          aria-label={t("layout.minimal_tooltip")}
        />
        <ToggleGroupItem
          text={t("layout.poweruser")}
          isSelected={layout === "poweruser"}
          onChange={() => handleChange("poweruser")}
          aria-label={t("layout.poweruser_tooltip")}
        />
        <ToggleGroupItem
          text={t("layout.pretty")}
          isSelected={layout === "pretty"}
          onChange={() => handleChange("pretty")}
          aria-label={t("layout.pretty_tooltip")}
        />
        <ToggleGroupItem
          text={t("layout.unix")}
          isSelected={layout === "unix"}
          onChange={() => handleChange("unix")}
          aria-label={t("layout.unix_tooltip")}
        />
      </ToggleGroup>
    </Tooltip>
  );
}
