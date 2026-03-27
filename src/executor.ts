import { exec } from "child_process";
import { CommandConfig } from "./types";

export function executeCommand(
  cmdConfig: CommandConfig,
  args: string,
  maxOutput: number
): Promise<string> {
  return new Promise((resolve) => {
    const command = cmdConfig.exec.replace(/\$\{args\}/g, args || "");
    const timeout = (cmdConfig.timeout || 30) * 1000;

    exec(command, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          resolve(`命令超时（${cmdConfig.timeout || 30}s）`);
          return;
        }
        const errMsg = stderr?.trim() || error.message;
        resolve(`命令执行失败: ${errMsg}`.slice(0, maxOutput));
        return;
      }

      let output = stdout.trim();
      if (!output && stderr?.trim()) {
        output = stderr.trim();
      }
      if (!output) {
        output = "(无输出)";
      }

      // Truncate to max_output
      if (output.length > maxOutput) {
        output = output.slice(0, maxOutput - 20) + "\n... (输出已截断)";
      }

      resolve(output);
    });
  });
}
