import WebSocket from "ws";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama2";

class ActivityClient {
  constructor() {
    this.ws = null;
    this.clientId = null;
    this.clientName = null;
    this.isConnected = false;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  connect() {
    console.log("🔄 Connecting to WebSocket server...");
    
    this.ws = new WebSocket("ws://localhost:8000");

    this.ws.on("open", () => {
      this.isConnected = true;
      console.log("🔗 Connected to WebSocket server");
    });

    this.ws.on("message", (data) => {
      this.handleMessage(JSON.parse(data.toString()));
    });

    this.ws.on("close", () => {
      this.isConnected = false;
      console.log("\n❎ Connection closed.");
      this.showMenu();
    });

    this.ws.on("error", (error) => {
      console.error("❌ WebSocket error:", error.message);
      this.showMenu();
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'welcome':
        this.clientId = message.clientId;
        this.clientName = `Client-${this.clientId}`;
        console.log(`✅ ${message.message}`);
        console.log(`👥 Total connected clients: ${message.connectedClients}`);
        this.showMenu();
        break;

      case 'stream':
        process.stdout.write(message.content);
        break;

      case 'stream_end':
        console.log(`\n\n✅ ${message.message}`);
        if (message.stats) {
          console.log(`📊 Stats: ${message.stats.tokens} tokens, Model: ${message.stats.model}`);
        }
        this.showMenu();
        break;

      case 'error':
        console.log(`\n❌ Error: ${message.message}`);
        this.showMenu();
        break;

      case 'name_set':
        this.clientName = message.name;
        console.log(`✅ ${message.message}`);
        this.showMenu();
        break;

      case 'client_list':
        console.log("\n👥 Connected Clients:");
        message.clients.forEach(client => {
          const youMarker = client.isYou ? " (YOU)" : "";
          console.log(`   ${client.id}: ${client.name}${youMarker} - Connected: ${client.connected}`);
        });
        this.showMenu();
        break;

      case 'broadcast':
        console.log(`\n📢 Server Broadcast: ${message.message}`);
        break;

      case 'user_broadcast':
        console.log(`\n💬 Broadcast from ${message.from}: ${message.message}`);
        break;

      case 'client_name_changed':
        console.log(`\n📝 ${message.oldName} changed name to ${message.newName}`);
        break;

      case 'client_disconnected':
        console.log(`\n👋 ${message.name} disconnected`);
        break;

      case 'server_shutdown':
        console.log(`\n🛑 ${message.message}`);
        break;

      case 'broadcast_sent':
        console.log(`✅ ${message.message}`);
        this.showMenu();
        break;

      default:
        console.log("📨 Unknown message:", message);
    }
  }

  showMenu() {
    if (!this.isConnected) {
      console.log("\n🔌 Choose an option:");
      console.log("1. Reconnect to server");
      console.log("2. Exit");
      this.rl.question("\nEnter your choice (1-2): ", (choice) => {
        switch (choice) {
          case '1':
            this.connect();
            break;
          case '2':
            this.exit();
            break;
          default:
            console.log("❌ Invalid choice");
            this.showMenu();
        }
      });
      return;
    }

    console.log(`\n🎮 Menu (You are: ${this.clientName}):`);
    console.log("1. Ask AI a question");
    console.log("2. Set your name");
    console.log("3. View connected clients");
    console.log("4. Broadcast message to all clients");
    console.log("5. Disconnect");
    console.log("6. Exit");

    this.rl.question("\nEnter your choice (1-6): ", (choice) => {
      switch (choice) {
        case '1':
          this.askQuestion();
          break;
        case '2':
          this.setName();
          break;
        case '3':
          this.getClients();
          break;
        case '4':
          this.broadcastMessage();
          break;
        case '5':
          this.disconnect();
          break;
        case '6':
          this.exit();
          break;
        default:
          console.log("❌ Invalid choice");
          this.showMenu();
      }
    });
  }

  askQuestion() {
    this.rl.question("\n💭 Enter your question for AI: ", (prompt) => {
      if (!prompt.trim()) {
        console.log("❌ Please enter a valid question");
        this.showMenu();
        return;
      }

      console.log(`\n🤖 AI Response (Model: ${OLLAMA_MODEL}):`);
      console.log("─".repeat(50));
      
      this.ws.send(JSON.stringify({
        type: 'chat',
        model: OLLAMA_MODEL,
        prompt: prompt
      }));
    });
  }

  setName() {
    this.rl.question(`\n📝 Enter new name (current: ${this.clientName}): `, (name) => {
      if (!name.trim()) {
        console.log("❌ Name cannot be empty");
        this.showMenu();
        return;
      }

      this.ws.send(JSON.stringify({
        type: 'set_name',
        name: name.trim()
      }));
    });
  }

  getClients() {
    console.log("\n🔍 Fetching client list...");
    this.ws.send(JSON.stringify({
      type: 'get_clients'
    }));
  }

  broadcastMessage() {
    this.rl.question("\n📢 Enter message to broadcast to all clients: ", (message) => {
      if (!message.trim()) {
        console.log("❌ Message cannot be empty");
        this.showMenu();
        return;
      }

      this.ws.send(JSON.stringify({
        type: 'broadcast',
        message: message.trim()
      }));
    });
  }

  disconnect() {
    if (this.ws && this.isConnected) {
      console.log("🔌 Disconnecting...");
      this.ws.close();
    } else {
      console.log("❌ Not connected to server");
      this.showMenu();
    }
  }

  exit() {
    console.log("👋 Goodbye!");
    if (this.ws && this.isConnected) {
      this.ws.close();
    }
    this.rl.close();
    process.exit(0);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log("\n\n👋 Goodbye!");
  process.exit(0);
});

// Start the client
console.log("🚀 Activity Client for Ollama WebSocket");
console.log("=====================================");

const client = new ActivityClient();
client.connect();
