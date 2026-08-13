const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
const apiBaseUrl = configuredApiBaseUrl || '/api/v1';

export function apiPath(path: string): string {
  return [apiBaseUrl, path.replace(/^\/+/, '')].join('/');
}

export interface SystemOverview {
  data_mode: 'live';
  source: 'native';
  observed_at: string;
  host: {
    hostname: string;
    operating_system: string;
    booted_at: string;
    uptime_seconds: number;
  };
  cpu: { usage_percent: number; physical_cores: number; logical_cores: number };
  memory: {
    total_bytes: number;
    available_bytes: number;
    used_bytes: number;
    usage_percent: number;
  };
  disk: { total_bytes: number; used_bytes: number; free_bytes: number; usage_percent: number };
  running_processes: number;
  process_collection_status: 'available' | 'limited';
  top_processes: Array<{ pid: number; name: string; memory_percent: number; status: string }>;
}

export interface DataSourceState {
  status: 'available' | 'unavailable';
  detail: string;
  observed_at: string;
}

export interface DefenderOverview {
  source: 'microsoft_defender';
  state: DataSourceState;
  antivirus_enabled: boolean | null;
  real_time_protection_enabled: boolean | null;
  behavior_monitor_enabled: boolean | null;
  signature_last_updated: string | null;
  engine_version: string | null;
  detections: Array<{
    threat_id: number | null;
    name: string;
    severity: string | null;
    category: string | null;
    resources: string[];
    action_success: boolean | null;
    detected_at: string | null;
    status_changed_at: string | null;
  }>;
}

export interface SysmonOverview {
  source: 'sysmon';
  state: DataSourceState;
  events: Array<{
    record_id: number;
    event_id: number;
    event_type: string;
    occurred_at: string;
    provider: string;
    message: string;
  }>;
}

export interface NetworkOverview {
  source: 'windows_networking';
  state: DataSourceState;
  neighbors: Array<{
    ip_address: string;
    link_layer_address: string | null;
    state: string | null;
    interface_alias: string | null;
    address_family: string | null;
  }>;
  tcp_connections: Array<{
    local_address: string;
    local_port: number;
    remote_address: string;
    remote_port: number;
    state: string;
    owning_process_id: number;
    owning_process_name: string | null;
  }>;
}

export interface DefenderScanCapability {
  source: 'microsoft_defender';
  state: DataSourceState;
  antivirus_enabled: boolean | null;
  custom_scan_available: boolean;
}

export interface DefenderScanAction {
  source: 'microsoft_defender';
  action: 'custom_scan';
  state: 'started' | 'unavailable' | 'failed';
  directory: string;
  detail: string;
  requested_at: string;
}

export interface CopilotStatus {
  enabled: boolean;
  provider: 'ollama';
  model: string;
  detail: string;
}

export interface CopilotBrief {
  provider: 'ollama';
  model: string;
  generated_at: string;
  evidence_sources: string[];
  answer: string;
}

export async function getSystemOverview(signal?: AbortSignal): Promise<SystemOverview> {
  return getJson<SystemOverview>('/system/overview', signal);
}

export async function getDefenderOverview(signal?: AbortSignal): Promise<DefenderOverview> {
  return getJson<DefenderOverview>('/security/defender', signal);
}

export async function getSysmonOverview(signal?: AbortSignal): Promise<SysmonOverview> {
  return getJson<SysmonOverview>('/security/sysmon', signal);
}

export async function getNetworkOverview(signal?: AbortSignal): Promise<NetworkOverview> {
  return getJson<NetworkOverview>('/network/overview', signal);
}

export async function getDefenderScanCapability(
  signal?: AbortSignal,
): Promise<DefenderScanCapability> {
  return getJson<DefenderScanCapability>('/file-security/defender', signal);
}

export async function startDefenderScan(directory: string): Promise<DefenderScanAction> {
  return sendJson<DefenderScanAction>('/file-security/defender/scans', { directory });
}

export async function getCopilotStatus(signal?: AbortSignal): Promise<CopilotStatus> {
  return getJson<CopilotStatus>('/copilot/status', signal);
}

export async function requestCopilotBrief(question: string): Promise<CopilotBrief> {
  return sendJson<CopilotBrief>('/copilot/brief', {
    confirm_local_evidence: true,
    question,
  });
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiPath(path), {
    headers: { 
      Accept: 'application/json',
      'ngrok-skip-browser-warning': 'true'
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`HATSS data request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

async function sendJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiPath(path), {
    body: JSON.stringify(body),
    headers: { 
      Accept: 'application/json', 
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    },
    method: 'POST',
  });
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(errorBody?.detail || `HATSS action request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}
