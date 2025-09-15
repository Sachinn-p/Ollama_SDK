import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-coder:6.7b";

const ws = new WebSocket("ws://localhost:8000");

ws.on("open", () => {
  console.log("🔗 Connected to WebSocket server\n");

  ws.send(JSON.stringify({
    model: OLLAMA_MODEL,
    prompt: "Write a short poem about AI and humans"
  }));
});

ws.on("message", (data) => {
  process.stdout.write(data.toString()); // live stream like Ollama CLI
});

ws.on("close", () => {
  console.log("\n❎ Connection closed.");
});
