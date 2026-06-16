import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Drawer,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  DrawerPanelContent,
  Title,
  FormGroup,
  Switch,
  NumberInput,
  Button,
} from "@patternfly/react-core";
import { CogIcon } from "@patternfly/react-icons";
import "./SettingsDrawer.css";

export interface AppSettings {
  refreshIntervalMs: number;
  logLineLimit: number;
  toastsEnabled: boolean;
  confirmDownEnabled: boolean;
}

const SETTINGS_KEY = "cockpit-compose:settings";

const DEFAULTS: AppSettings = {
  refreshIntervalMs: 500,
  logLineLimit: 5000,
  toastsEnabled: true,
  confirmDownEnabled: true,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function saveSettings(s: AppSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ── Context ────────────────────────────────────────────────────────────────────

interface SettingsContextValue {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  openSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const NOOP_SETTINGS: SettingsContextValue = {
  settings: { ...DEFAULTS },
  updateSetting: () => {},
  openSettings: () => {},
};

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext) ?? NOOP_SETTINGS;
}

// ── Provider + Drawer ─────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
}

export function SettingsProvider({ children }: Props) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [open, setOpen] = useState(false);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const openSettings = useCallback(() => setOpen(true), []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, openSettings }}>
      <Drawer isExpanded={open} position="right" className="cc-settings-drawer">
        <DrawerContent
          panelContent={
            <DrawerPanelContent widths={{ default: "width_33" }}>
              <DrawerHead>
                <Title headingLevel="h2" size="md">{t("settings.title")}</Title>
                <DrawerActions>
                  <DrawerCloseButton onClick={() => setOpen(false)} />
                </DrawerActions>
              </DrawerHead>
              <div className="cc-settings-body">
                <FormGroup label={t("settings.refresh_interval_label")} fieldId="set-refresh">
                  <div className="cc-settings-row">
                    <NumberInput
                      id="set-refresh"
                      value={settings.refreshIntervalMs}
                      min={200}
                      max={5000}
                      onMinus={() => updateSetting("refreshIntervalMs", Math.max(200, settings.refreshIntervalMs - 100))}
                      onPlus={() => updateSetting("refreshIntervalMs", Math.min(5000, settings.refreshIntervalMs + 100))}
                      onChange={(e) => {
                        const v = Number((e.target as HTMLInputElement).value);
                        if (!isNaN(v)) updateSetting("refreshIntervalMs", Math.max(200, Math.min(5000, v)));
                      }}
                    />
                    <span className="cc-settings-unit">ms</span>
                  </div>
                  <p className="cc-settings-hint">{t("settings.refresh_interval_hint")}</p>
                </FormGroup>

                <FormGroup label={t("settings.log_line_limit_label")} fieldId="set-log-limit">
                  <NumberInput
                    id="set-log-limit"
                    value={settings.logLineLimit}
                    min={100}
                    max={20000}
                    onMinus={() => updateSetting("logLineLimit", Math.max(100, settings.logLineLimit - 500))}
                    onPlus={() => updateSetting("logLineLimit", Math.min(20000, settings.logLineLimit + 500))}
                    onChange={(e) => {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (!isNaN(v)) updateSetting("logLineLimit", Math.max(100, Math.min(20000, v)));
                    }}
                  />
                  <p className="cc-settings-hint">{t("settings.log_line_limit_hint")}</p>
                </FormGroup>

                <FormGroup label={t("settings.toasts_label")} fieldId="set-toasts">
                  <Switch
                    id="set-toasts"
                    isChecked={settings.toastsEnabled}
                    onChange={(_e, checked) => updateSetting("toastsEnabled", checked)}
                    label={settings.toastsEnabled ? t("settings.toasts_on") : t("settings.toasts_off")}
                  />
                </FormGroup>

                <FormGroup label={t("settings.confirm_down_label")} fieldId="set-confirm-down">
                  <Switch
                    id="set-confirm-down"
                    isChecked={settings.confirmDownEnabled}
                    onChange={(_e, checked) => updateSetting("confirmDownEnabled", checked)}
                    label={settings.confirmDownEnabled ? t("settings.confirm_down_on") : t("settings.confirm_down_off")}
                  />
                  <p className="cc-settings-hint">{t("settings.confirm_down_hint")}</p>
                </FormGroup>

                <div className="cc-settings-reset">
                  <Button
                    variant="link"
                    isDanger
                    onClick={() => {
                      saveSettings(DEFAULTS);
                      setSettings({ ...DEFAULTS });
                    }}
                  >
                    {t("settings.reset_defaults")}
                  </Button>
                </div>
              </div>
            </DrawerPanelContent>
          }
        >
          <DrawerContentBody>{children}</DrawerContentBody>
        </DrawerContent>
      </Drawer>
    </SettingsContext.Provider>
  );
}

// ── Gear button (used in toolbar) ─────────────────────────────────────────────

export function SettingsButton() {
  const { t } = useTranslation();
  const { openSettings } = useSettings();
  return (
    <Button variant="plain" onClick={openSettings} aria-label={t("settings.open_button")} title={t("settings.open_button")}>
      <CogIcon />
    </Button>
  );
}
