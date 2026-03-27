import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { getConfigPath } from "./config";

const SERVICE_NAME = "openilink-app-runner";

function getBinPath(): string {
  try {
    return execSync("which openilink-app-runner", { encoding: "utf-8" }).trim();
  } catch {
    return path.resolve(__dirname, "../bin/runner.js");
  }
}

// ========== Linux (systemd --user) ==========

function systemdUnit(configPath: string): string {
  const absConfig = path.resolve(configPath);
  const binPath = getBinPath();
  const workDir = path.dirname(absConfig);

  return `[Unit]
Description=OpeniLink App Runner
After=network.target

[Service]
Type=simple
ExecStart=${binPath} start --config ${absConfig}
WorkingDirectory=${workDir}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
}

function installSystemd(configPath: string): void {
  const userDir = path.join(os.homedir(), ".config/systemd/user");
  fs.mkdirSync(userDir, { recursive: true });
  const unitPath = path.join(userDir, `${SERVICE_NAME}.service`);

  fs.writeFileSync(unitPath, systemdUnit(configPath));
  execSync(`systemctl --user daemon-reload`);
  execSync(`systemctl --user enable ${SERVICE_NAME}`);
  execSync(`systemctl --user start ${SERVICE_NAME}`);
  // Enable lingering so user services run without login
  try {
    execSync(`loginctl enable-linger ${os.userInfo().username}`, { stdio: "ignore" });
  } catch {}

  console.log(`✓ 已安装 systemd 用户服务（无需 sudo）`);
  console.log(`  服务文件: ${unitPath}`);
  console.log(`  配置文件: ${path.resolve(configPath)}`);
  console.log(`  查看状态: systemctl --user status ${SERVICE_NAME}`);
  console.log(`  查看日志: journalctl --user -u ${SERVICE_NAME} -f`);
}

function uninstallSystemd(): void {
  try { execSync(`systemctl --user stop ${SERVICE_NAME}`, { stdio: "ignore" }); } catch {}
  try { execSync(`systemctl --user disable ${SERVICE_NAME}`, { stdio: "ignore" }); } catch {}

  const unitPath = path.join(os.homedir(), `.config/systemd/user/${SERVICE_NAME}.service`);
  if (fs.existsSync(unitPath)) {
    fs.unlinkSync(unitPath);
    execSync(`systemctl --user daemon-reload`);
  }
  console.log(`✓ 已卸载 systemd 用户服务`);
}

// ========== macOS (launchd) ==========

function launchdPlist(configPath: string): string {
  const absConfig = path.resolve(configPath);
  const binPath = getBinPath();
  const logDir = path.join(os.homedir(), "Library/Logs");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openilink.app-runner</string>
    <key>ProgramArguments</key>
    <array>
        <string>${binPath}</string>
        <string>start</string>
        <string>--config</string>
        <string>${absConfig}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logDir}/openilink-app-runner.log</string>
    <key>StandardErrorPath</key>
    <string>${logDir}/openilink-app-runner.err</string>
</dict>
</plist>
`;
}

function installLaunchd(configPath: string): void {
  const plistPath = path.join(os.homedir(), "Library/LaunchAgents/com.openilink.app-runner.plist");
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, launchdPlist(configPath));

  try { execSync(`launchctl unload ${plistPath}`, { stdio: "ignore" }); } catch {}
  execSync(`launchctl load ${plistPath}`);

  console.log(`✓ 已安装 launchd 服务（无需 sudo）`);
  console.log(`  配置文件: ${plistPath}`);
  console.log(`  日志: ~/Library/Logs/openilink-app-runner.log`);
}

function uninstallLaunchd(): void {
  const plistPath = path.join(os.homedir(), "Library/LaunchAgents/com.openilink.app-runner.plist");
  try { execSync(`launchctl unload ${plistPath}`, { stdio: "ignore" }); } catch {}
  if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath);
  console.log(`✓ 已卸载 launchd 服务`);
}

// ========== Public API ==========

export function install(configPath?: string): void {
  const resolved = configPath || getConfigPath();
  const absConfig = path.resolve(resolved);

  if (!fs.existsSync(absConfig)) {
    console.error(`配置文件不存在: ${absConfig}`);
    console.error(`请先运行: openilink-app-runner init --hub-url <url> --token <token>`);
    process.exit(1);
  }

  if (os.platform() === "darwin") {
    installLaunchd(absConfig);
  } else if (os.platform() === "linux") {
    installSystemd(absConfig);
  } else {
    console.error(`不支持的平台: ${os.platform()}`);
    console.error(`请手动运行: openilink-app-runner start`);
    process.exit(1);
  }
}

export function uninstall(): void {
  if (os.platform() === "darwin") {
    uninstallLaunchd();
  } else if (os.platform() === "linux") {
    uninstallSystemd();
  } else {
    console.error(`不支持的平台: ${os.platform()}`);
    process.exit(1);
  }
}

export function status(): void {
  if (os.platform() === "linux") {
    const unitPath = path.join(os.homedir(), `.config/systemd/user/${SERVICE_NAME}.service`);
    if (!fs.existsSync(unitPath)) {
      console.log("⚪ 未安装（服务文件不存在）");
      return;
    }
    try {
      const out = execSync(`systemctl --user status ${SERVICE_NAME} 2>&1`, { encoding: "utf-8" });
      if (out.includes("active (running)")) {
        console.log("🟢 运行中");
      } else if (out.includes("inactive")) {
        console.log("⚫ 已停止");
      } else if (out.includes("failed")) {
        console.log("🔴 已崩溃");
      }
      console.log(out.trim());
    } catch (err: any) {
      console.log("⚫ 未运行");
      if (err.stdout) console.log(err.stdout.toString().trim());
    }
  } else if (os.platform() === "darwin") {
    const plistPath = path.join(os.homedir(), "Library/LaunchAgents/com.openilink.app-runner.plist");
    if (!fs.existsSync(plistPath)) {
      console.log("⚪ 未安装（plist 不存在）");
      return;
    }
    try {
      const out = execSync(`launchctl list | grep openilink`, { encoding: "utf-8" });
      if (out.trim()) {
        console.log("🟢 运行中");
        console.log(out.trim());
      } else {
        console.log("⚫ 未运行");
      }
    } catch {
      console.log("⚫ 未运行");
    }
  } else {
    console.log("不支持的平台");
  }
}
