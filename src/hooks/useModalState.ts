import { useReducer, useCallback } from "react";
import { type ComposeStack } from "../api";

export type ModalName =
  | "logs"
  | "yaml"
  | "info"
  | "upConfirm"
  | "up"
  | "down"
  | "kill"
  | "env"
  | "scale"
  | "prune"
  | "exec"
  | "run"
  | "pull"
  | "pullConfirm"
  | "events"
  | "top"
  | "backup";

type ModalTarget = ComposeStack | null;

export type ModalAction =
  | { type: "open"; modal: ModalName; target: ComposeStack }
  | { type: "close"; modal: ModalName }
  | { type: "transition"; from: ModalName; to: ModalName; target?: ComposeStack }
  | { type: "setProfiles"; profiles: string[] };

export type ModalState = {
  [K in ModalName]: ModalTarget;
} & { upProfiles: string[] };

const INITIAL_STATE: ModalState = {
  logs: null,
  yaml: null,
  info: null,
  upConfirm: null,
  up: null,
  down: null,
  kill: null,
  env: null,
  scale: null,
  prune: null,
  exec: null,
  run: null,
  pull: null,
  pullConfirm: null,
  events: null,
  top: null,
  backup: null,
  upProfiles: [],
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "open":
      return { ...state, [action.modal]: action.target };
    case "close":
      return { ...state, [action.modal]: null };
    case "transition":
      return {
        ...state,
        [action.from]: null,
        [action.to]: action.target ?? state[action.from],
      };
    case "setProfiles":
      return { ...state, upProfiles: action.profiles };
    default:
      return state;
  }
}

export function useModalState() {
  const [state, dispatch] = useReducer(modalReducer, INITIAL_STATE);

  const open = useCallback((modal: ModalName, target: ComposeStack) => {
    dispatch({ type: "open", modal, target });
  }, []);

  const close = useCallback((modal: ModalName) => {
    dispatch({ type: "close", modal });
  }, []);

  const transition = useCallback((from: ModalName, to: ModalName, target?: ComposeStack) => {
    dispatch({ type: "transition", from, to, target });
  }, []);

  return { state, dispatch, open, close, transition };
}
