export interface CommandConfig {
  description?: string;
  exec: string;
  timeout?: number; // seconds, default 30
}

export interface RunnerConfig {
  hub_url: string;
  app_token: string;
  max_output?: number; // default 2000
  commands: Record<string, CommandConfig>;
}

export interface HubEvent {
  type: string;
  v: number;
  trace_id: string;
  installation_id: string;
  bot: { id: string };
  event: {
    type: string;
    id: string;
    timestamp: number;
    data: Record<string, any>;
  };
}
