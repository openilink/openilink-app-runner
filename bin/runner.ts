#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { loadConfig, saveConfig, initConfig, getConfigPath } from "../src/config";
import { syncTools } from "../src/sync";
import { HubConnection } from "../src/hub";
import { createHandler } from "../src/handler";
import { install, uninstall, status } from "../src/daemon";

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"));
const program = new Command();

program
  .name("openilink-app-runner")
  .description("Run local commands as OpeniLink Hub App tools")
  .version(pkg.version);

program
  .command("init")
  .description("初始化配置文件")
  .option("-c, --config <path>", "配置文件路径", "runner.yaml")
  .requiredOption("--hub-url <url>", "Hub URL")
  .requiredOption("--token <token>", "App Token")
  .action((opts) => {
    initConfig(opts.config, opts.hubUrl, opts.token);
    console.log(`✓ 配置已写入 ${opts.config}`);
  });

program
  .command("add <name> <exec>")
  .description("添加命令")
  .option("-c, --config <path>", "配置文件路径", "runner.yaml")
  .option("-d, --desc <description>", "命令描述")
  .option("-t, --timeout <seconds>", "超时时间", "30")
  .action(async (name, exec, opts) => {
    const configPath = getConfigPath(opts.config);
    const config = loadConfig(configPath);
    config.commands[name] = {
      exec,
      description: opts.desc || name,
      timeout: parseInt(opts.timeout, 10),
    };
    saveConfig(configPath, config);
    console.log(`✓ 已添加命令 /${name}`);

    // Auto-sync to Hub
    try {
      await syncTools(config);
    } catch (err: any) {
      console.error(`⚠ 同步到 Hub 失败: ${err.message}`);
    }
  });

program
  .command("remove <name>")
  .description("删除命令")
  .option("-c, --config <path>", "配置文件路径", "runner.yaml")
  .action(async (name, opts) => {
    const configPath = getConfigPath(opts.config);
    const config = loadConfig(configPath);
    if (!config.commands[name]) {
      console.error(`命令 /${name} 不存在`);
      process.exit(1);
    }
    delete config.commands[name];
    saveConfig(configPath, config);
    console.log(`✓ 已删除命令 /${name}`);

    // Auto-sync to Hub
    try {
      await syncTools(config);
    } catch (err: any) {
      console.error(`⚠ 同步到 Hub 失败: ${err.message}`);
    }
  });

program
  .command("list")
  .description("查看已配置的命令")
  .option("-c, --config <path>", "配置文件路径", "runner.yaml")
  .action((opts) => {
    const config = loadConfig(getConfigPath(opts.config));
    const cmds = Object.entries(config.commands);
    if (cmds.length === 0) {
      console.log("暂无命令。使用 add <name> <exec> 添加。");
      return;
    }
    console.log(`Hub: ${config.hub_url}`);
    console.log(`命令 (${cmds.length}):`);
    for (const [name, cmd] of cmds) {
      console.log(`  /${name} — ${cmd.description || "(无描述)"}`);
      console.log(`    exec: ${cmd.exec}`);
      if (cmd.timeout) console.log(`    timeout: ${cmd.timeout}s`);
    }
  });

program
  .command("sync")
  .description("手动同步命令到 Hub")
  .option("-c, --config <path>", "配置文件路径", "runner.yaml")
  .action(async (opts) => {
    const config = loadConfig(getConfigPath(opts.config));
    await syncTools(config);
  });

program
  .command("start")
  .description("启动 runner，连接 Hub 并监听命令")
  .option("-c, --config <path>", "配置文件路径", "runner.yaml")
  .action(async (opts) => {
    const config = loadConfig(getConfigPath(opts.config));
    const cmdCount = Object.keys(config.commands).length;

    console.log(`openilink-app-runner v${pkg.version}`);
    console.log(`Hub: ${config.hub_url}`);
    console.log(`命令: ${cmdCount} 个`);

    if (cmdCount === 0) {
      console.log("⚠ 没有配置命令。使用 add <name> <exec> 添加。");
    }

    // Sync tools on startup
    try {
      await syncTools(config);
    } catch (err: any) {
      console.error(`⚠ 同步 tools 失败: ${err.message}`);
      console.log("继续启动...");
    }

    // Connect to Hub
    const handler = createHandler(config);
    const hub = new HubConnection(config, handler);

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n正在停止...");
      hub.stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      hub.stop();
      process.exit(0);
    });

    hub.connect();
  });

program
  .command("install")
  .description("注册为系统服务（systemd / launchd），开机自启")
  .option("-c, --config <path>", "配置文件路径", "runner.yaml")
  .action((opts) => {
    install(getConfigPath(opts.config));
  });

program
  .command("uninstall")
  .description("卸载系统服务")
  .action(() => {
    uninstall();
  });

program
  .command("status")
  .description("查看服务状态")
  .action(() => {
    status();
  });

// Default: show help
if (process.argv.length <= 2) {
  program.help();
}

program.parse();
