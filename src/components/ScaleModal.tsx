import { useState, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  NumberInput,
  Spinner,
  Alert,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
} from "@patternfly/react-core";
import { ExclamationTriangleIcon } from "@patternfly/react-icons";
import {
  type ComposeStack,
  type ComposeContainer,
  listContainers,
  readComposeFile,
  getServicesFromCompose,
  scaleStack,
  composeFileSuperuser,
  readAllProfiles,
  isRootlessMode,
  parseJsonOutput,
  parsePortsFull,
} from "../api";

interface ServiceInfo {
  count: number;
  hasHostPorts: boolean;
}

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

async function loadServiceInfo(
  stackName: string,
  configFiles: string[],
): Promise<Record<string, ServiceInfo>> {
  let raw = "";
  const proc = listContainers(stackName);
  proc.stream(d => { raw += d; });
  await proc;
  const running = parseJsonOutput<ComposeContainer>(raw);

  const seen = new Set<string>();
  const serviceNames: string[] = [];
  for (const f of configFiles) {
    let content = "";
    const cp = readComposeFile(f);
    cp.stream(d => { content += d; });
    await cp;
    for (const name of getServicesFromCompose(content)) {
      if (!seen.has(name)) { seen.add(name); serviceNames.push(name); }
    }
  }

  const info: Record<string, ServiceInfo> = {};
  for (const name of serviceNames) {
    const containers = running.filter(c => c.Service === name);
    const hasHostPorts = containers.some(
      c => c.Ports && parsePortsFull(c.Ports).some(p => p.hostPort !== ""),
    );
    info[name] = { count: containers.length, hasHostPorts };
  }
  return info;
}

export function ScaleModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const configFiles = stack.ConfigFiles.split(",").map(f => f.trim());

  const [step, setStep] = useState<"config" | "confirm">("config");
  const [serviceInfo, setServiceInfo] = useState<Record<string, ServiceInfo>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [initialCounts, setInitialCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scaling, setScaling] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    loadServiceInfo(stack.Name, configFiles)
      .then(info => {
        setServiceInfo(info);
        const initial = Object.fromEntries(Object.entries(info).map(([k, v]) => [k, v.count]));
        setCounts(initial);
        setInitialCounts(initial);
        setLoading(false);
      })
      .catch((ex: unknown) => {
        setLoadError(ex instanceof Error ? ex.message : String(ex));
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const services = Object.keys(serviceInfo);
  const changes = services.filter(svc => counts[svc] !== initialCounts[svc]);
  const portConflicts = changes.filter(svc => counts[svc] > 1 && serviceInfo[svc]?.hasHostPorts);

  const handleApply = async () => {
    setScaling(true);
    setApplyError(null);
    try {
      const [su, profiles] = await Promise.all([
        isRootlessMode() ? Promise.resolve<"try" | undefined>(undefined) : composeFileSuperuser(configFiles),
        readAllProfiles(configFiles[0]),
      ]);
      await scaleStack(stack.Name, configFiles, counts, profiles, su);
      onClose();
    } catch (ex: unknown) {
      setApplyError(ex instanceof Error ? ex.message : String(ex));
      setScaling(false);
    }
  };

  const title = t("scale_modal.title", { name: stack.Name });

  if (loading) {
    return (
      <Modal isOpen variant="small" onClose={onClose} aria-label={t("scale_modal.aria_label")}>
        <ModalHeader title={title} />
        <ModalBody><Spinner size="md" /></ModalBody>
        <ModalFooter>
          <Button variant="link" onClick={onClose}>{t("common.cancel")}</Button>
        </ModalFooter>
      </Modal>
    );
  }

  if (loadError) {
    return (
      <Modal isOpen variant="small" onClose={onClose} aria-label={t("scale_modal.aria_label")}>
        <ModalHeader title={title} />
        <ModalBody>
          <Alert variant="danger" isInline title={loadError} />
        </ModalBody>
        <ModalFooter>
          <Button variant="link" onClick={onClose}>{t("common.cancel")}</Button>
        </ModalFooter>
      </Modal>
    );
  }

  if (step === "confirm") {
    return (
      <Modal
        isOpen
        variant="small"
        onClose={() => { if (!scaling) onClose(); }}
        aria-label={t("scale_modal.aria_label")}
      >
        <ModalHeader title={t("scale_modal.confirm_title")} />
        <ModalBody>
          <Alert
            variant="info"
            isInline
            title={t("scale_modal.what_is_scale_title")}
            style={{ marginBottom: "1rem" }}
          >
            {t("scale_modal.what_is_scale_body")}
          </Alert>

          <DescriptionList isCompact style={{ marginBottom: "1rem" }}>
            {changes.map(svc => (
              <DescriptionListGroup key={svc}>
                <DescriptionListTerm>
                  {svc}
                  {serviceInfo[svc]?.hasHostPorts && counts[svc] > 1 && (
                    <ExclamationTriangleIcon
                      color="var(--pf-t--global--icon--color--status--warning--default)"
                      style={{ marginLeft: "0.4em" }}
                      title={t("scale_modal.port_conflict_icon_title")}
                    />
                  )}
                </DescriptionListTerm>
                <DescriptionListDescription>
                  {initialCounts[svc]} → {counts[svc]}
                </DescriptionListDescription>
              </DescriptionListGroup>
            ))}
          </DescriptionList>

          {portConflicts.length > 0 && (
            <Alert
              variant="warning"
              isInline
              title={t("scale_modal.port_conflict_title")}
              style={{ marginBottom: "1rem" }}
            >
              <p>{t("scale_modal.port_conflict_body")}</p>
              <ul style={{ marginTop: "0.5rem", marginLeft: "1.25rem" }}>
                {portConflicts.map(svc => <li key={svc}><code>{svc}</code></li>)}
              </ul>
            </Alert>
          )}

          {applyError && (
            <Alert variant="danger" isInline title={applyError} />
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant={portConflicts.length > 0 ? "warning" : "primary"}
            onClick={() => void handleApply()}
            isLoading={scaling}
            isDisabled={scaling}
          >
            {t("scale_modal.apply_button")}
          </Button>
          <Button variant="link" onClick={() => setStep("config")} isDisabled={scaling}>
            {t("common.back")}
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      variant="small"
      onClose={onClose}
      aria-label={t("scale_modal.aria_label")}
    >
      <ModalHeader title={title} />
      <ModalBody>
        <Alert
          variant="info"
          isInline
          title={t("scale_modal.sideeffects_title")}
          style={{ marginBottom: "1rem" }}
        >
          {t("scale_modal.sideeffects_body")}
        </Alert>
        <div style={{ overflowY: "auto", maxHeight: "45vh" }}>
          <Form>
            {services.map(svc => {
              const wouldConflict = serviceInfo[svc]?.hasHostPorts && counts[svc] > 1;
              return (
                <FormGroup key={svc} label={svc} fieldId={`scale-${svc}`}>
                  <NumberInput
                    id={`scale-${svc}`}
                    value={counts[svc]}
                    min={0}
                    onMinus={() => setCounts(prev => ({ ...prev, [svc]: Math.max(0, (prev[svc] ?? 1) - 1) }))}
                    onPlus={() => setCounts(prev => ({ ...prev, [svc]: (prev[svc] ?? 0) + 1 }))}
                    onChange={(e: FormEvent<HTMLInputElement>) => {
                      const v = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!isNaN(v) && v >= 0) setCounts(prev => ({ ...prev, [svc]: v }));
                    }}
                    inputAriaLabel={t("scale_modal.service_label", { service: svc })}
                    minusBtnAriaLabel={t("scale_modal.minus_aria", { service: svc })}
                    plusBtnAriaLabel={t("scale_modal.plus_aria", { service: svc })}
                  />
                  {wouldConflict && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem variant="warning" icon={<ExclamationTriangleIcon />}>
                          {t("scale_modal.port_conflict_inline")}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              );
            })}
          </Form>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={() => setStep("confirm")}
          isDisabled={changes.length === 0}
        >
          {t("common.continue")}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
