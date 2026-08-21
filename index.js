require("dotenv").config();

const bedrock = require("bedrock-protocol");

const MIN_RECONNECT_DELAY = 5000;
const MAX_RECONNECT_DELAY = 300000;

let client = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let respawnTimeout = null;
let afkInterval = null;

function getReconnectDelay() {
  const base = Math.min(
    MIN_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );

  // Add 0–2 seconds of random jitter
  return base + Math.floor(Math.random() * 2000);
}

function clearTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (respawnTimeout) {
    clearTimeout(respawnTimeout);
    respawnTimeout = null;
  }

  if (afkInterval) {
    clearInterval(afkInterval);
    afkInterval = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  reconnectAttempts++;

  const delay = getReconnectDelay();

  console.log(
    `Reconnecting in ${Math.round(delay / 1000)} seconds (attempt ${reconnectAttempts})`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function autoRespawn() {
  if (respawnTimeout || !client) return;

  respawnTimeout = setTimeout(() => {
    try {
      console.log("Attempting auto respawn...");

      client.queue("respawn", {
        state: 0,
        position: {
          x: 0,
          y: 0,
          z: 0
        }
      });

      console.log("Respawn packet sent.");
    } catch (err) {
      console.log("Respawn failed:", err.message);
    }

    respawnTimeout = null;
  }, 1000);
}

function startAfkMovement() {
  if (afkInterval) {
    clearInterval(afkInterval);
  }

  let direction = 1;

  afkInterval = setInterval(() => {
    try {
      if (!client?.entity?.position) {
        return;
      }

      client.queue("player_auth_input", {
        pitch: 0,
        yaw: 0,
        head_yaw: 0,

        position: client.entity.position,

        move_vector: {
          x: direction,
          y: 0
        },

        delta: {
          x: 0,
          y: 0,
          z: 0
        },

        input_data: [],
        input_mode: 2,
        play_mode: 0,
        interaction_model: 0,
        tick: BigInt(0)
      });

      direction *= -1;

      console.log("AFK movement sent.");
    } catch (err) {
      console.log("AFK movement error:", err.message);
    }
  }, 120000); // every 2 minutes
}

function connect() {
  console.log("Connecting...");

  client = bedrock.createClient({
    host: process.env.SERVER_HOST,
    port: Number(process.env.SERVER_PORT),
    username: process.env.BOT_USERNAME || "AFKBot",
    offline: true
    raknetBackend: "jsp-raknet"
  });

  client.on("join", () => {
    console.log("JOINED!");
    reconnectAttempts = 0;
  });

  client.on("spawn", () => {
    console.log("SPAWNED!");
    startAfkMovement();
  });

  client.on("kick", (reason) => {
    console.log("KICK:", reason);
    clearTimers();
    scheduleReconnect();
  });

  client.on("disconnect", (reason) => {
    console.log("DISCONNECT:", reason);
    clearTimers();
    scheduleReconnect();
  });

  client.on("close", () => {
    console.log("CONNECTION CLOSED");
    clearTimers();
    scheduleReconnect();
  });

  client.on("error", (err) => {
    console.error("ERROR:", err);
  });

  client.on("packet", (_data, meta) => {
    const name = String(meta?.name || "").toLowerCase();

    if (name.includes("death") || name.includes("respawn")) {
      console.log(`Detected packet: ${meta.name}`);
      autoRespawn();
    }
  });
}

process.on("SIGINT", () => {
  console.log("Shutting down...");
  clearTimers();
  process.exit(0);
});

connect();
