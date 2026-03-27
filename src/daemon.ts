import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";

const SERVICE_NAME = "openilink-app-runner";

function getBinPath(): string {
  try {
    return execSync("which openilink-app-runner", { encoding: "utf-8" }).trim();
  } catch {
    // Fallback: resolve from node_modules
    return path.resolve(__dirname, "../bin/runner.js");
  }
}

function getNodePath(): string {
  return process.execPath;
}

// ========== Linux (systemd) ==========

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
WantedBy=multi-user.target
`;
}

function installSystemd(configPath: string): void {
  const unitPath = `/etc/systemd/system/${SERVICE_NAME}.service`;
  const unit = systemdUnit(configPath);

  fs.writeFileSync(unitPath, unit);
  execSync("systemctl daemon-reload");
  execSync(`systemctl enable ${SERVICE_NAME}`);
  execSync(`systemctl start ${SERVICE_NAME}`);

  console.log(`✓ 已安装 systemd 服务`);
  console.log(`  服务文件: ${unitPath}`);
  console.log(`  配置文件: ${path.resolve(configPath)}`);
  console.log(`  查看状态: systemctl status ${SERVICE_NAME}`);
  console.log(`  查看日志: journalctl -u ${SERVICE_NAME} -f`);
}

function uninstallSystemd(): void {
  try {
    execSync(`systemctl stop ${SERVICE_NAME}`, { stdio: "ignore" });
  } catch {}
  try {
    execSync(`systemctl disable ${SERVICE_NAME}`, { stdio: "ignore" });
  } catch {}

  const unitPath = `/etc/systemd/system/${SERVICE_NAME}.service`;
  if (fs.existsSync(unitPath)) {
    fs.unlinkSync(unitPath);
    execSync("systemctl daemon-reload");
  }
  console.log(`✓ 已卸载 systemd 服务`);
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
  const plistPath = path.join(os.homedir(), `Library/LaunchAgents/com.openilink.app-runner.plist`);
  const plist = launchdPlist(configPath);

  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, plist);

  try {
    execSync(`launchctl unload ${plistPath}`, { stdio: "ignore" });
  } catch {}
  execSync(`launchctl load ${plistPath}`);

  console.log(`✓ 已安装 launchd 服务`);
  console.log(`  配置文件: ${plistPath}`);
  console.log(`  日志: ~/Library/Logs/openilink-app-runner.log`);
}

function uninstallLaunchd(): void {
  const plistPath = path.join(os.homedir(), `Library/LaunchAgents/com.openilink.app-runner.plist`);
  try {
    execSync(`launchctl unload ${plistPath}`, { stdio: "ignore" });
  } catch {}
  if (fs.existsSync(plistPath)) {
    fs.unlinkSync(plistPath);
  }
  console.log(`✓ 已卸载 launchd 服务`);
}

// ========== Public API ==========

export function install(configPath: string): void {
  const absConfig = path.resolve(configPath);
  if (!fs.existsSync(absConfig)) {
    console.error(`配置文件不存在: ${absConfig}`);
    console.error(`请先运行: openilink-app-runner init --hub-url <url> --token <token>`);
    process.exit(1);
  }

  if (os.platform() === "darwin") {
    installLaunchd(configPath);
  } else if (os.platform() === "linux") {
    installSystemd(configPath);
  } else {
    console.error(`不支持的平台: ${os.platform()}`);
    console.error(`请手动运行: openilink-app-runner start --config ${absConfig}`);
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
