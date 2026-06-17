import { useTranslation } from "react-i18next";
import {
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Title,
  SearchInput,
  Label,
  Tooltip,
} from "@patternfly/react-core";
import { type ComposeStack, type Runtime } from "../../api";
import { RuntimeToggle } from "../RuntimeToggle";

export const STATUS_FILTER_OPTIONS = ["running", "partial", "stopped", "paused"] as const;
export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

export const filterColorMap: Record<StatusFilter, "green" | "orange" | "grey" | "blue"> = {
  running: "green",
  partial: "orange",
  stopped: "grey",
  paused: "blue",
};

interface Props {
  stacks: ComposeStack[];
  statusCounts: Record<string, number>;
  activeFilters: Set<StatusFilter>;
  searchTerm: string;
  onFilterToggle: (f: StatusFilter) => void;
  onSearchChange: (v: string) => void;
  onRuntimeChange?: (r: Runtime) => void;
  onReset: () => void;
  dockerMissing?: boolean;
}

export function StacksToolbar({
  stacks,
  statusCounts,
  activeFilters,
  searchTerm,
  onFilterToggle,
  onSearchChange,
  onRuntimeChange,
  onReset,
  dockerMissing,
}: Props) {
  const { t } = useTranslation();

  return (
    <Toolbar className="sv-toolbar">
      <ToolbarContent>
        <ToolbarItem>
          <Title headingLevel="h2">{t("stacks.title")}</Title>
        </ToolbarItem>

        {stacks.length > 0 && (
          <ToolbarItem>
            <div className="sv-status-badges">
              {STATUS_FILTER_OPTIONS.filter(f => (statusCounts[f] ?? 0) > 0).map(f => (
                <Tooltip key={f} content={t(`stacks.filter_tooltip_${f}`)}>
                  <Label
                    isCompact
                    color={filterColorMap[f]}
                    className={`sv-filter-chip${activeFilters.has(f) ? " sv-filter-chip--active" : ""}`}
                    onClick={() => onFilterToggle(f)}
                  >
                    {statusCounts[f]} {t(`stacks.status_${f}`)}
                  </Label>
                </Tooltip>
              ))}
            </div>
          </ToolbarItem>
        )}

        {stacks.length > 0 && (
          <ToolbarItem>
            <SearchInput
              className="sv-search"
              value={searchTerm}
              onChange={(_e, v) => onSearchChange(v)}
              onClear={() => onSearchChange("")}
              placeholder={t("stacks.search_placeholder")}
              aria-label={t("stacks.search_placeholder")}
            />
          </ToolbarItem>
        )}

        <ToolbarItem align={{ default: "alignEnd" }}>
          <RuntimeToggle
            onRuntimeChange={(r) => { onReset(); onRuntimeChange?.(r); }}
            suggestPodman={dockerMissing}
          />
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );
}
