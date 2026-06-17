import { useState } from "react";
import { type ComposeStack } from "../api";

export function useModalTargets() {
  const [logsTarget, setLogsTarget] = useState<ComposeStack | null>(null);
  const [yamlTarget, setYamlTarget] = useState<ComposeStack | null>(null);
  const [infoTarget, setInfoTarget] = useState<ComposeStack | null>(null);
  const [upConfirmTarget, setUpConfirmTarget] = useState<ComposeStack | null>(null);
  const [upTarget, setUpTarget] = useState<ComposeStack | null>(null);
  const [upTargetProfiles, setUpTargetProfiles] = useState<string[]>([]);
  const [pullConfirmTarget, setPullConfirmTarget] = useState<ComposeStack | null>(null);
  const [pullTarget, setPullTarget] = useState<ComposeStack | null>(null);
  const [eventsTarget, setEventsTarget] = useState<ComposeStack | null>(null);
  const [topTarget, setTopTarget] = useState<ComposeStack | null>(null);
  const [execTarget, setExecTarget] = useState<ComposeStack | null>(null);
  const [runTarget, setRunTarget] = useState<ComposeStack | null>(null);
  const [pruneTarget, setPruneTarget] = useState<ComposeStack | null>(null);
  const [backupTarget, setBackupTarget] = useState<ComposeStack | null>(null);
  const [scaleTarget, setScaleTarget] = useState<ComposeStack | null>(null);

  return {
    logsTarget, setLogsTarget,
    yamlTarget, setYamlTarget,
    infoTarget, setInfoTarget,
    upConfirmTarget, setUpConfirmTarget,
    upTarget, setUpTarget,
    upTargetProfiles, setUpTargetProfiles,
    pullConfirmTarget, setPullConfirmTarget,
    pullTarget, setPullTarget,
    eventsTarget, setEventsTarget,
    topTarget, setTopTarget,
    execTarget, setExecTarget,
    runTarget, setRunTarget,
    pruneTarget, setPruneTarget,
    backupTarget, setBackupTarget,
    scaleTarget, setScaleTarget,
  };
}
