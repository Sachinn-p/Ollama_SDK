import WebSocket from "ws";
import dotenv from "dotenv";
import readline from "readline";

dotenv.config();

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-coder:6.7b";

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function connectAndChat() {
  const ws = new WebSocket("ws://localhost:8000");

  ws.on("open", () => {
    console.log("🔗 Connected to WebSocket server");
    console.log(`🤖 Using model: ${OLLAMA_MODEL}\n`);
    
    askQuestion();
  });

  function askQuestion() {
    rl.question("💬 Ask me anything (or 'quit' to exit): ", (prompt) => {
      if (prompt.toLowerCase() === 'quit' || prompt.toLowerCase() === 'exit') {
        console.log("👋 Goodbye!");
        ws.close();
        rl.close();
        return;
      }

      if (!prompt.trim()) {
        console.log("Please enter a question or prompt.");
        askQuestion();
        return;
      }

      console.log("\n🤖 Generating response...\n");
      
      ws.send(JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt.trim()
      }));
    });
  }

  ws.on("message", (data) => {
    const message = data.toString();
    
    if (message.includes("--- generation complete ---")) {
      console.log("\n");
      setTimeout(() => {
        askQuestion(); // Ask for next question
      }, 100);
    } else {
      process.stdout.write(message); // Live stream like Ollama CLI
    }
  });

ws.on("close", () => {
  console.log("\n❎ Connection closed.");
  
  // Ask if user wants to continue
  setTimeout(() => {
    if (!rl.closed) {
      askQuestion();
    }
  }, 1000);
});

ws.on("error", (error) => {
  console.error("❌ WebSocket error:", error.message);
  rl.close();
});
}

console.log("🚀 Ollama WebSocket CLI Client");
console.log("===============================");
connectAndChat();
