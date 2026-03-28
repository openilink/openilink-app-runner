import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import { RunnerConfig } from "./types";

function defaultConfigDir(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (process.getuid?.() === 0) {
    return "/etc/openilink-app-runner";
  }
  if (platform === "darwin") {
    return path.join(home, "Library/Application Support/openilink-app-runner");
  }
  return path.join(home, ".config/openilink-app-runner");
}

export function getConfigPath(custom?: string): string {
  if (custom) return custom;
  // Check current directory first
  if (fs.existsSync("runner.yaml")) return "runner.yaml";
  // Then standard directory
  return path.join(defaultConfigDir(), "runner.yaml");
}

export function loadConfig(configPath: string): RunnerConfig {
  if (!fs.existsSync(configPath)) {
    console.error(`配置文件不存在: ${configPath}`);
    console.error(`\n使用 init 创建:\n  openilink-app-runner init --hub-url http://localhost:9800 --token <app_token>`);
    process.exit(1);
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
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
