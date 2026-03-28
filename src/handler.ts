import { RunnerConfig, HubEvent } from "./types";
import { executeCommand } from "./executor";

export function createHandler(config: RunnerConfig) {
  return async (event: HubEvent, sendReply: (content: string, to?: string) => void) => {
    if (event.event.type !== "command") return;

    const cmdName = event.event.data.command as string;
    const text = (event.event.data.text as string) || "";
    const sender = event.event.data.sender as any;

    console.log(`← /${cmdName} ${text} (from ${sender?.id || "unknown"})`);

    const cmdConfig = config.commands[cmdName];
    if (!cmdConfig) {
      const available = Object.keys(config.commands).map(c => `/${c}`).join(", ");
      sendReply(`未知命令: /${cmdName}\n可用命令: ${available}`);
      return;
    }

    try {
      const result = await executeCommand(cmdConfig, text, config.max_output || 2000);
      console.log(`→ (${result.length} chars)`);
      sendReply(result);
    } catch (err: any) {
      console.error(`命令执行出错:`, err);
      sendReply(`执行失败: ${err.message}`);
    }
  };
}
