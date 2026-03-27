import { RunnerConfig } from "./types";

export async function syncTools(config: RunnerConfig): Promise<void> {
  const tools = Object.entries(config.commands).map(([name, cmd]) => ({
    name,
    description: cmd.description || name,
    command: name,
    parameters: {
      type: "object",
      properties: {
        args: { type: "string", description: "命令参数" },
      },
    },
  }));

  const resp = await fetch(`${config.hub_url}/bot/v1/installation/tools`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${config.app_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tools }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`同步 tools 失败: ${resp.status} ${text}`);
  }

  const result = await resp.json();
  console.log(`✓ 已同步 ${result.tool_count} 个命令到 Hub`);
}
