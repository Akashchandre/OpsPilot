import dotenv from "dotenv";
import { stderr, stdout } from "node:process";
import { ConfigurationError, loadEnvironment } from "../config/env.js";
import { createRazorpayAdapter } from "../modules/payments/razorpay.adapter.js";

dotenv.config({ path: ".env", override: true, quiet: true });

function writeResult(stream, result) {
  stream.write(`${JSON.stringify(result)}\n`);
}

async function main() {
  let config;
  try {
    config = loadEnvironment();
  } catch (error) {
    writeResult(stderr, {
      event: "razorpay.preflight_failed",
      code: "CONFIGURATION_INVALID",
      fields: error instanceof ConfigurationError ? error.fields : [],
    });
    process.exitCode = 1;
    return;
  }

  if (!config.payments.razorpay.enabled) {
    writeResult(stderr, {
      event: "razorpay.preflight_failed",
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
      fields: [
        "RAZORPAY_ENABLED",
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
      ],
    });
    process.exitCode = 1;
    return;
  }

  try {
    const provider = createRazorpayAdapter(config);
    await provider.findOrderByReceipt("op_preflight_connection_check");
    writeResult(stdout, {
      event: "razorpay.preflight_completed",
      mode: "test",
      configuration: "valid",
      apiCredentials: "verified",
      externalChecksRequired: [
        "automatic_capture",
        "public_https_webhook",
        "webhook_event_subscriptions",
      ],
    });
  } catch (error) {
    writeResult(stderr, {
      event: "razorpay.preflight_failed",
      code:
        typeof error?.code === "string" && error.code.startsWith("PAYMENT_PROVIDER_")
          ? error.code
          : "PAYMENT_PROVIDER_UNAVAILABLE",
    });
    process.exitCode = 1;
  }
}

await main();
