import { useState } from "react";
import { Popover, Button } from "@patternfly/react-core";
import { OutlinedQuestionCircleIcon } from "@patternfly/react-icons";

interface Props {
  header: string;
  body: string;
  "aria-label"?: string;
}

export function HelpPopover({ header, body, "aria-label": ariaLabel }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <Popover
      headerContent={header}
      bodyContent={body}
      isVisible={visible}
      shouldOpen={() => setVisible(true)}
      shouldClose={() => setVisible(false)}
    >
      <Button
        variant="plain"
        aria-label={ariaLabel ?? header}
        style={{ padding: "0 0.25rem", minWidth: 0, color: "var(--pf-t--global--text--color--subtle)" }}
      >
        <OutlinedQuestionCircleIcon style={{ fontSize: "0.9rem" }} />
      </Button>
    </Popover>
  );
}
