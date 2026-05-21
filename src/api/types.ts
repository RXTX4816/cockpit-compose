export interface ComposeStack {
  Name: string;
  Status: string;
  ConfigFiles: string;
}

export interface ComposeContainer {
  ID: string;
  Name: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
  Service: string;
}

export type StackStatus = "running" | "partial" | "down" | "unknown";

export interface ContainerStats {
  id: string;
  name: string;
  cpu: string;
  mem: string;
  memPerc: string;
  net: string;
  block: string;
}

export interface Snapshot {
  timestamp: number;
  name: string;
  path: string;
}
