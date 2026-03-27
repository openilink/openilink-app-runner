import * as fs from "fs";
import * as yaml from "js-yaml";
import { RunnerConfig } from "./types";

const DEFAULT_PATH = "runner.yaml";

export function getConfigPath(custom?: string): string {
  return custom || DEFAULT_PATH;
}

export function loadConfig(configPath: string): RunnerConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = yaml.load(raw) as RunnerConfig;
  if (!config.hub_url) throw new Error("hub_url is required in config");
  if (!config.app_token) throw new Error("app_token is required in config");
  if (!config.commands) config.commands = {};
  if (!config.max_output) config.max_output = 2000;
  return config;
}

export function saveConfig(configPath: string, config: RunnerConfig): void {
  const raw = yaml.dump(config, { lineWidth: -1, noRefs: true });
  fs.writeFileSync(configPath, raw, "utf-8");
}

export function initConfig(configPath: string, hubUrl: string, appToken: string): void {
  const config: RunnerConfig = {
    hub_url: hubUrl,
    app_token: appToken,
    max_output: 2000,
    commands: {},
  };
  saveConfig(configPath, config);
}
