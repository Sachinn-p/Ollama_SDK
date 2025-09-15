import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";

// Create WebSocket server
const wss = new WebSocketServer({ port: 8000 });

wss.on("connection", (ws) => {
  console.log("✅ Client connected");

  ws.on("message", async (msg) => {
    try {
      const payload = JSON.parse(msg.toString());
      payload.stream = true; // force streaming like CLI

      console.log("📤 Sending to Ollama:", OLLAMA_URL);
      console.log("📝 Payload:", JSON.stringify(payload));

      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("📥 Response status:", response.status);
      console.log("📥 Response ok:", response.ok);

      if (!response.ok || !response.body) {
        ws.send("❌ Error connecting to Ollama (is it running?)");
        ws.close();
        return;
      }

      // Handle streaming response from node-fetch
      let buffer = '';
      
      response.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            if (data.response) {
              ws.send(data.response); // live tokens
            }

            if (data.done) {
              ws.send("\n--- generation complete ---\n");
              ws.close();
              return;
            }
          } catch (parseErr) {
            console.error("Bad JSON from Ollama:", line);
            // Skip invalid JSON lines
          }
        }
      });

      response.body.on('end', () => {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            if (data.done) {
              ws.send("\n--- generation complete ---\n");
              ws.close();
            }
          } catch (parseErr) {
            console.error("Bad JSON from Ollama:", buffer);
          }
        }
      });

      response.body.on('error', (err) => {
        console.error("Stream error:", err);
        ws.send("❌ Stream error");
        ws.close();
      });
    } catch (err) {
      console.error("❌ Server error:", err.message);
      ws.send("❌ Internal server error");
      ws.close();
    }
  });

  ws.on("close", () => {
    console.log("❎ Client disconnected");
  });
});

console.log("🚀 WebSocket server running at ws://localhost:8000");
