/**
 * Integration test for openilink-app-runner using the Hub mock server.
 *
 * Prerequisites:
 *   go run ./cmd/appmock --listen :19801 --app-token test-runner-token --app-slug runner
 *
 * Run:
 *   npx tsx test/integration.test.ts
 */

import { HubConnection, EventHandler } from "../src/hub";
import { RunnerConfig, HubEvent } from "../src/types";
import { createHandler } from "../src/handler";

const MOCK_HUB = process.env.MOCK_HUB || "http://localhost:19801";
const APP_TOKEN = process.env.APP_TOKEN || "test-runner-token";

const config: RunnerConfig = {
  hub_url: MOCK_HUB,
  app_token: APP_TOKEN,
  max_output: 2000,
  commands: {
    echo: { exec: 'echo "${args}"', description: "Echo arguments" },
    date: { exec: "date +%Y-%m-%d", description: "Show current date" },
  },
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ✗ ${msg}`);
    failed++;
  } else {
    console.log(`  ✓ ${msg}`);
    passed++;
  }
}

async function fetchJSON(path: string, opts?: RequestInit) {
  const resp = await fetch(`${MOCK_HUB}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return resp.json() as Promise<any>;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ----- Tests -----

async function testSyncTools() {
  console.log("\n== testSyncTools ==");

  const tools = Object.entries(config.commands).map(([name, cmd]) => ({
    name,
    description: cmd.description || name,
    command: name,
    parameters: {
      type: "object",
      properties: { args: { type: "string", description: "命令参数" } },
    },
  }));

  const resp = await fetch(`${MOCK_HUB}/bot/v1/installation/tools`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${APP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tools }),
  });

  const result = await resp.json() as any;
  assert(result.ok === true, "sync tools returns ok");
  assert(result.tool_count === 2, `tool_count is 2 (got ${result.tool_count})`);
}

async function testBotAPI() {
  console.log("\n== testBotAPI ==");

  // GET /bot/v1/info
  const info = await fetch(`${MOCK_HUB}/bot/v1/info`, {
    headers: { Authorization: `Bearer ${APP_TOKEN}` },
  }).then((r) => r.json()) as any;
  assert(info.ok === true, "bot info returns ok");
  assert(info.bot.status === "connected", "bot is connected");

  // GET /bot/v1/contact
  const contacts = await fetch(`${MOCK_HUB}/bot/v1/contact`, {
    headers: { Authorization: `Bearer ${APP_TOKEN}` },
  }).then((r) => r.json()) as any;
  assert(contacts.ok === true, "contacts returns ok");
  assert(Array.isArray(contacts.contacts), "contacts is an array");

  // POST /bot/v1/message/send
  const send = await fetch(`${MOCK_HUB}/bot/v1/message/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${APP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: "user_test", content: "hello from test" }),
  }).then((r) => r.json()) as any;
  assert(send.ok === true, "send message returns ok");
  assert(typeof send.client_id === "string", "send returns client_id");
}

async function testWSConnectionAndReply() {
  console.log("\n== testWSConnectionAndReply ==");

  // Reset state
  await fetchJSON("/mock/reset", { method: "POST" });

  const handler = createHandler(config);
  const hub = new HubConnection(config, handler);

  // Wait for connection
  await new Promise<void>((resolve) => {
    const origConnect = hub.connect.bind(hub);
    hub.connect = function () {
      origConnect();
      // Give WS time to connect and receive init
      setTimeout(resolve, 1000);
    };
    hub.connect();
  });

  // Inject a /echo command via mock server
  const inject = await fetchJSON("/mock/event", {
    method: "POST",
    body: JSON.stringify({
      sender: "user_alice",
      content: "/echo hello world",
    }),
  });
  assert(inject.ok === true, "event injection returns ok");

  // Wait for command execution and reply
  await sleep(2000);

  // Check if the reply was sent
  const messages = await fetchJSON("/mock/messages");

  const provMsgs = messages.provider_messages || [];
  const hasEchoReply = provMsgs.some(
    (m: any) => m.to === "user_alice" && m.text?.includes("hello world")
  );
  assert(hasEchoReply, "echo reply sent to user_alice with correct content");

  hub.stop();
  await sleep(500);
}

async function testWSAuthFailure() {
  console.log("\n== testWSAuthFailure ==");

  const resp = await fetch(`${MOCK_HUB}/bot/v1/info`, {
    headers: { Authorization: "Bearer wrong-token" },
  });
  assert(resp.status === 401, `wrong token returns 401 (got ${resp.status})`);
}

async function testMockControlEndpoints() {
  console.log("\n== testMockControlEndpoints ==");

  // Reset
  const reset = await fetchJSON("/mock/reset", { method: "POST" });
  assert(reset.ok === true, "reset returns ok");

  // Config
  const cfg = await fetchJSON("/mock/config");
  assert(cfg.app_token === APP_TOKEN, "config shows correct token");
  assert(cfg.bot_id === "mock-bot", "config shows mock-bot");

  // Messages after reset should be empty
  const msgs = await fetchJSON("/mock/messages");
  assert(
    (!msgs.store_messages || msgs.store_messages.length === 0) &&
      (!msgs.provider_messages || msgs.provider_messages.length === 0),
    "messages empty after reset"
  );
}

// ----- Main -----

async function main() {
  console.log(`Testing against mock Hub: ${MOCK_HUB}`);
  console.log(`App token: ${APP_TOKEN}`);

  // Verify mock server is running
  try {
    await fetch(`${MOCK_HUB}/mock/config`);
  } catch {
    console.error(
      `\nMock server not running. Start it first:\n  go run ./cmd/appmock --listen :19801 --app-token test-runner-token --app-slug runner\n`
    );
    process.exit(1);
  }

  await testMockControlEndpoints();
  await testSyncTools();
  await testBotAPI();
  await testWSAuthFailure();
  await testWSConnectionAndReply();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
