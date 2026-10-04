import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, ClipboardCopy, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "@patternfly/react-core";
import { planDamagedRepair, runDamagedRepair, type RepairPlan, type StackLeftovers } from "../api";

interface Props {
  name: string;
  leftovers: StackLeftovers;
  superuser?: "try";
  /** Offered for ordinary leftovers: removes them by project label, without the compose file. */
  onForceRemove?: () => void;
  forceRemoving?: boolean;
  /** Called after a repair, so the caller can check again what is left. */
  onRepaired: () => Promise<void>;
}

/**
 * Shown when Docker still lists a stack's containers after Down or Kill (#345), so the
 * stack never seems to "do nothing". Ordinary leftovers get a force remove; damaged
 * container records, which Docker can neither start nor remove, get an explanation, the
 * exact repair commands and a Repair button.
 */
export function StackLeftoversPanel({ name, leftovers, superuser, onForceRemove, forceRemoving, onRepaired }: Props) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<RepairPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  const ordinary = leftovers.ids.filter(id => !leftovers.damaged.includes(id));
  const damagedKey = leftovers.damaged.join(",");

  useEffect(() => {
    if (leftovers.damaged.length === 0) { setPlan(null); return; }
    let live = true;
    planDamagedRepair(leftovers.damaged, superuser)
      .then(p => { if (live) setPlan(p); })
      .catch((ex: unknown) => { if (live) setPlanError(ex instanceof Error ? ex.message : String(ex)); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damagedKey, superuser]);

  const repair = async () => {
    if (!plan) return;
    setConfirmRepair(false);
    setRepairing(true);
    setRepairError(null);
    try {
      await runDamagedRepair(plan);
      await onRepaired();
    } catch (ex: unknown) {
      setRepairError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      {ordinary.length > 0 && (
        <Alert variant="warning" isInline title={t("leftovers.remaining_title", { name })}>
          <p>{t("leftovers.remaining_body")}</p>
          <ul style={{ margin: "0.25rem 0 0.5rem 1.25rem", padding: 0 }}>
            {ordinary.map(id => <li key={id}><code>{id.slice(0, 12)}</code></li>)}
          </ul>
          {onForceRemove && (
            <Button variant="danger" size="sm" onClick={onForceRemove} isLoading={forceRemoving} isDisabled={forceRemoving}>
              {t("leftovers.force_remove")}
            </Button>
          )}
        </Alert>
      )}

      {leftovers.damaged.length > 0 && (
        <Alert variant="danger" isInline title={t("leftovers.damaged_title")} style={{ marginTop: ordinary.length > 0 ? "0.75rem" : 0 }}>
          <p>{t("leftovers.damaged_body")}</p>
          {!plan && !planError && <Spinner size="md" />}
          {planError && <p><code>{planError}</code></p>}
          {plan && (
            <>
              <ClipboardCopy
                isCode
                isReadOnly
                isExpanded
                variant="expansion"
                hoverTip={t("common.copy")}
                clickTip={t("common.copied")}
                style={{ margin: "0.5rem 0" }}
              >
                {plan.commands.join("\n")}
              </ClipboardCopy>
              <Button variant="danger" size="sm" onClick={() => setConfirmRepair(true)} isLoading={repairing} isDisabled={repairing}>
                {t("leftovers.repair_button")}
              </Button>
            </>
          )}
          {repairError && <p style={{ marginTop: "0.5rem" }}><code>{repairError}</code></p>}
        </Alert>
      )}

      {confirmRepair && (
        <Modal isOpen variant="small" onClose={() => setConfirmRepair(false)} aria-label={t("leftovers.repair_confirm_title")}>
          <ModalHeader title={t("leftovers.repair_confirm_title")} />
          <ModalBody>
            <p>{t("leftovers.repair_confirm_body")}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={() => void repair()}>{t("leftovers.repair_confirm_button")}</Button>
            <Button variant="link" onClick={() => setConfirmRepair(false)}>{t("common.cancel")}</Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
