import { useEffect, useState } from "react";
import { DownloadIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
} from "@patternfly/react-core";
import { type ComposeStack, readComposeFile } from "../api";
import { splitConfigFiles } from "../lib/configFiles";
import { parseServiceImages, type ServiceImage } from "../lib/serviceImages";

interface Props {
  stack: ComposeStack;
  onConfirm: () => void;
  onClose: () => void;
}

export function PullConfirmModal({ stack, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const configFile = splitConfigFiles(stack.ConfigFiles)[0] ?? "";
  const [images, setImages] = useState<ServiceImage[]>([]);

  useEffect(() => {
    let content = "";
    const proc = readComposeFile(configFile);
    proc.stream((data: string) => { content += data; });
    void proc.then(() => setImages(parseServiceImages(content)));
  }, [configFile]);

  const riskyImages = images.filter(i => i.risky);
  const hasRisky = riskyImages.length > 0;

  return (
    <Modal isOpen onClose={onClose} variant="small" aria-label={t("pull_confirm_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("pull_confirm_modal.title", { name: stack.Name })} />
      <ModalBody>
        <Alert
          variant="warning"
          isInline
          title={t("pull_confirm_modal.warning_title")}
          style={{ marginBottom: "1rem" }}
        >
          {t("pull_confirm_modal.warning_body_prefix")}{" "}
          <code>:latest</code>{" "}
          {t("pull_confirm_modal.warning_body_suffix")}
        </Alert>

        {images.length > 0 && (
          <div style={{ fontSize: "0.875rem" }}>
            <strong>{t("pull_confirm_modal.images_title")}</strong>
            <ul style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
              {images.map(({ service, image, risky, pullPolicy }) => (
                <li key={service} style={{ marginBottom: "0.25rem" }}>
                  <code>{service}</code>
                  {" — "}
                  <code>{image}</code>
                  {pullPolicy && (
                    <span style={{ marginLeft: "0.4rem", color: "var(--pf-t--global--text--color--subtle)" }}>
                      {t("common.pull_policy_label", { policy: pullPolicy })}
                    </span>
                  )}
                  {risky && (
                    <span style={{ marginLeft: "0.4rem", color: "var(--pf-t--global--color--status--warning--default)" }}>
                      {t("pull_confirm_modal.unpinned_label")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {hasRisky && (
              <p style={{ marginTop: "0.75rem", color: "var(--pf-t--global--text--color--subtle)", fontSize: "0.8rem" }}>
                {t("pull_confirm_modal.unpinned_notice")}
              </p>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" icon={<DownloadIcon />} onClick={onConfirm}>{t("pull_confirm_modal.pull_button")}</Button>
        <Button variant="link" onClick={onClose}>{t("common.cancel")}</Button>
      </ModalFooter>
    </Modal>
  );
}
