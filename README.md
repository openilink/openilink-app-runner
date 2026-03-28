# openilink-app-runner

将本地命令行工具桥接到微信 —— 通过 OpeniLink Hub 接收微信命令，在本地执行，返回结果。

## 工作原理

```
微信用户 → /weather 北京 → Hub → WebSocket → Runner → curl wttr.in/北京 → 结果返回微信
```

1. 在 YAML 配置中定义命令（名称 + shell 命令）
2. Runner 启动时自动同步命令到 Hub
3. 通过 WebSocket 保持连接，接收来自微信的命令事件
4. 在本地执行对应 shell 命令，将输出返回给微信用户

## 安装

```bash
npm install -g openilink-app-runner
```

## 快速开始

### 1. 初始化配置

```bash
openilink-app-runner init --hub-url https://hub.openilink.com --token app_xxx
```

配置文件保存在标准目录：
- macOS: `~/Library/Application Support/openilink-app-runner/runner.yaml`
- Linux: `~/.config/openilink-app-runner/runner.yaml`
- root: `/etc/openilink-app-runner/runner.yaml`

### 2. 添加命令

```bash
# 添加查天气命令（单引号包裹，${args} 不会被 shell 展开）
openilink-app-runner add weather 'curl -s "wttr.in/${args}?format=3"' -d "查天气" -t 5

# 添加查 IP 命令（无参数，不涉及 ${args}）
openilink-app-runner add ip "curl -s ifconfig.me" -d "查公网 IP" -t 5

# 查看已添加的命令
openilink-app-runner list
```

添加命令时会自动同步到 Hub。

### 3. 启动

```bash
openilink-app-runner start
```

现在在微信中发送 `/weather 北京` 即可看到天气结果。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `init --hub-url <url> --token <token>` | 初始化配置文件 |
| `add <name> <exec> [-d desc] [-t timeout]` | 添加命令 |
| `remove <name>` | 删除命令 |
| `list` | 查看已配置的命令 |
| `sync` | 手动同步命令到 Hub |
| `start` | 启动 runner，连接 Hub 并监听命令 |

所有命令支持 `-c, --config <path>` 指定自定义配置文件路径。

## 配置文件格式

```yaml
hub_url: "https://hub.openilink.com"
app_token: "app_your_token_here"
max_output: 2000  # 输出最大字符数

commands:
  weather:
    description: "查天气"
    exec: "curl -s 'wttr.in/${args}?format=3'"
    timeout: 5  # 秒，默认 30
  ip:
    description: "查公网 IP"
    exec: "curl -s ifconfig.me"
    timeout: 5
```

### 字段说明

- `hub_url` — Hub 服务地址（必填）
- `app_token` — App Token，在 Hub 中创建 App 后获取（必填）
- `max_output` — 命令输出最大字符数，超出截断（默认 2000）
- `commands` — 命令映射
  - `description` — 命令描述，会显示在微信中
  - `exec` — 要执行的 shell 命令，支持 `${args}` 占位符接收用户输入
  - `timeout` — 超时秒数（默认 30）

## 安全提示

`${args}` 会直接替换到 shell 命令中，存在命令注入风险。请注意：

- 仅在信任的微信群/用户中使用
- 避免在 `exec` 中使用 `${args}` 执行危险操作（如 `rm`、`sudo` 等）
- 设置合理的 `timeout` 防止命令卡住
- `max_output` 限制输出大小，防止刷屏

## 示例：集成 opencli

```yaml
commands:
  hn:
    description: "HackerNews 热门"
    exec: "opencli hackernews top --format json"
    timeout: 10
  github:
    description: "GitHub 趋势"
    exec: "opencli github trending ${args}"
    timeout: 10
```

## 自动重连

Runner 会自动维护 WebSocket 连接。断开后每 5 秒自动重连，同时通过 ping/pong 保持心跳。

---

## English

### What is this?

`openilink-app-runner` bridges local CLI commands to WeChat via [OpeniLink Hub](https://github.com/openilink/openilink-hub). Define commands in a YAML config, and WeChat users can invoke them by sending `/command args`.

### How it works

1. Define commands in `runner.yaml` (name + shell command)
2. Runner syncs commands to Hub on startup
3. Stays connected via WebSocket, receives command events from WeChat
4. Executes shell commands locally, returns output to WeChat

### Quick start

```bash
npm install -g openilink-app-runner

openilink-app-runner init --hub-url https://hub.openilink.com --token app_xxx
openilink-app-runner add weather 'curl -s "wttr.in/${args}?format=3"' -d "Weather" -t 5
openilink-app-runner start
```

### Security

`${args}` is interpolated directly into shell commands. Only use in trusted environments. Set reasonable timeouts and output limits.

## License

MIT
