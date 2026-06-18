import { Tooltip as PFTooltip, type TooltipProps } from "@patternfly/react-core";

export function Tooltip({ exitDelay = 0, ...props }: TooltipProps) {
  return <PFTooltip exitDelay={exitDelay} {...props} />;
}
