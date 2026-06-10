require("dotenv").config();

const bedrock = require("bedrock-protocol");

const MIN_RECONNECT_DELAY = 5000;
const MAX_RECONNECT_DELAY = 300000;

let reconnectAttempts = 0;
let reconnectTimer = null;
let client = null;

function getReconnectDelay() {
  const base = Math.min(
    MIN_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );

  // Add 0–2 seconds of jitter.
  return base + Math.floor(Math.random() * 2000);
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectAttempts++;

  const delay = getReconnectDelay();
  console.log(
    `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  console.log("Connecting...");

  client = bedrock.createClient({
    host: process.env.SERVER_HOST,
    port: Number(process.env.SERVER_PORT),
    username: process.env.BOT_USERNAME || "AFKBot",
    offline: true
  });

  client.on("join", () => {
    console.log("JOINED!");
    reconnectAttempts = 0;
  });

  client.on("spawn", () => {
    console.log("SPAWNED!");
  });

  client.on("kick", (reason) => {
    console.log("KICK:", reason);
    scheduleReconnect();
  });

  client.on("disconnect", (reason) => {
    console.log("DISCONNECT:", reason);
    scheduleReconnect();
  });

  client.on("close", () => {
    console.log("CONNECTION CLOSED");
    scheduleReconnect();
  });

  client.on("error", (err) => {
    console.error("ERROR:", err);
  });

  // Debug + experimental auto-respawn support.
  client.on("packet", (data, meta) => {
    const name = String(meta?.name || "").toLowerCase();

    if (name.includes("death") || name.includes("respawn")) {
      console.log("PACKET:", meta.name, data);

      // Attempt to trigger a respawn.
      try {
        client.queue("respawn", {
          state: 0,
          position: { x: 0, y: 0, z: 0 }
        });
        console.log("Respawn packet sent.");
      } catch (e) {
        console.log("Respawn packet could not be sent:", e.message);
      }
    }
  });
}

process.on("SIGINT", () => {
  console.log("Shutting down...");

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  process.exit(0);
});

connect();