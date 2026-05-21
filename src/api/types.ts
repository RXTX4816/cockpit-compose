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

export type StackStatus = "running" | "partial" | "stopped" | "paused" | "unknown";

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

export interface ComposeImage {
  ID: string;
  Repository: string;
  Tag: string;
  Size: number | string;
  CreatedAt: string;
  ContainerName: string;
}

export interface ComposeVolume {
  Name: string;
  Driver: string;
  Mountpoint: string;
}

export interface ComposeEvent {
  time: string | number;
  type: string;
  action: string;
  actor: {
    ID: string;
    Attributes: Record<string, string>;
  };
}

export interface ComposeTopEntry {
  service: string;
  titles: string[];
  processes: string[][];
}

export interface ComposeVersion {
  version: string;
  apiVersion?: string;
}
