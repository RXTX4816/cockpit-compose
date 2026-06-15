import { useEffect, useState } from "react";
import { ArrowCircleUpIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
  Checkbox,
} from "@patternfly/react-core";
import { load as loadYaml } from "js-yaml";
import { type ComposeStack, readComposeFile, getProfilesFromCompose } from "../api";
import { splitConfigFiles } from "../lib/configFiles";

interface ImageEntry {
  service: string;
  image: string;
  risky: boolean;
}

function parseImages(yaml: string): ImageEntry[] {
  try {
    const doc = loadYaml(yaml) as Record<string, unknown>;
    const services = doc?.services as Record<string, { image?: string; build?: unknown }> | undefined;
    if (!services) return [];
    return Object.entries(services)
      .filter(([, svc]) => svc?.image && !svc?.build)
      .map(([name, svc]) => {
        const image = svc.image!;
        const tag = image.includes(":") ? image.split(":").pop()! : "latest";
        const risky = tag === "latest" || tag === "";
        return { service: name, image, risky };
      });
  } catch {
    return [];
  }
}

interface Props {
  stack: ComposeStack;
  onConfirm: (profiles: string[]) => void;
  onClose: () => void;
}

export function UpConfirmModal({ stack, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const configFile = splitConfigFiles(stack.ConfigFiles)[0] ?? "";
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    let content = "";
    const proc = readComposeFile(configFile);
    proc.stream((data: string) => { content += data; });
    void proc.then(() => {
      setImages(parseImages(content));
      setProfiles(getProfilesFromCompose(content));
    });
  }, [configFile]);

  const toggleProfile = (name: string, checked: boolean) => {
    setSelectedProfiles(prev => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const hasRisky = images.some(i => i.risky);

  return (
    <Modal isOpen onClose={onClose} variant="small" aria-label={t("up_confirm_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("up_confirm_modal.title", { name: stack.Name })} />
      <ModalBody>
        <Alert
          variant="warning"
          isInline
          title={t("up_confirm_modal.warning_title")}
          style={{ marginBottom: "1rem" }}
        >
          {t("up_confirm_modal.warning_body_prefix")}{" "}
          <code>docker compose up -d</code>{" "}
          {t("up_confirm_modal.warning_body_middle")}{" "}
          <code>:latest</code>{" "}
          {t("up_confirm_modal.warning_body_suffix")}
        </Alert>

        {images.length > 0 && (
          <div style={{ fontSize: "0.875rem" }}>
            <strong>{t("up_confirm_modal.services_title")}</strong>
            <ul style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
              {images.map(({ service, image, risky }) => (
                <li key={service} style={{ marginBottom: "0.25rem" }}>
                  <code>{service}</code>
                  {" — "}
                  <code>{image}</code>
                  {risky && (
                    <span style={{ marginLeft: "0.4rem", color: "var(--pf-t--global--color--status--warning--default)" }}>
                      {t("up_confirm_modal.unpinned_label")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {hasRisky && (
              <p style={{ marginTop: "0.75rem", color: "var(--pf-t--global--text--color--subtle)", fontSize: "0.8rem" }}>
                {t("up_confirm_modal.unpinned_notice")}
              </p>
            )}
          </div>
        )}

        {profiles.length > 0 && (
          <div style={{ fontSize: "0.875rem", marginTop: "1rem" }}>
            <strong>{t("up_confirm_modal.profiles_title")}</strong>
            <div style={{ marginTop: "0.5rem" }}>
              {profiles.map(name => (
                <Checkbox
                  key={name}
                  id={`profile-${name}`}
                  label={name}
                  isChecked={selectedProfiles.has(name)}
                  onChange={(_e, checked) => toggleProfile(name, checked)}
                />
              ))}
            </div>
            <p style={{ marginTop: "0.5rem", color: "var(--pf-t--global--text--color--subtle)", fontSize: "0.8rem" }}>
              {t("up_confirm_modal.profiles_hint")}
            </p>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" icon={<ArrowCircleUpIcon />} onClick={() => onConfirm([...selectedProfiles])}>{t("up_confirm_modal.up_button")}</Button>
        <Button variant="link" onClick={onClose}>{t("common.cancel")}</Button>
      </ModalFooter>
    </Modal>
  );
}
