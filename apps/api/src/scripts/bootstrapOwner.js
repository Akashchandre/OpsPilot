import "dotenv/config";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { loadEnvironment } from "../config/env.js";
import { createDatabase } from "../db/prisma.js";
import { registerSchema } from "../modules/auth/auth.schemas.js";
import { bootstrapOwner } from "../modules/auth/ownerBootstrap.service.js";

function readNamedArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function promptHidden(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Owner bootstrap requires an interactive terminal");
  }

  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";

    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    }

    function onData(data) {
      for (const character of data) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Owner bootstrap cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function main() {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const displayName =
      readNamedArgument("display-name") ?? (await terminal.question("Owner display name: "));
    const email = readNamedArgument("email") ?? (await terminal.question("Owner email: "));
    terminal.close();

    const password = await promptHidden("Owner password: ");
    const confirmation = await promptHidden("Confirm owner password: ");
    if (password !== confirmation) throw new Error("Passwords do not match");

    const input = registerSchema.parse({ displayName, email, password });
    const config = loadEnvironment();
    const database = createDatabase(config.databaseUrl);

    try {
      const owner = await bootstrapOwner(database, input);
      stdout.write(`Owner created for ${owner.email}.\n`);
    } finally {
      await database.$disconnect();
    }
  } finally {
    terminal.close();
  }
}

main().catch((error) => {
  process.stderr.write(`Owner bootstrap failed: ${error.message}\n`);
  process.exitCode = 1;
});
