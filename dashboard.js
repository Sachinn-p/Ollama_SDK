import WebSocket from "ws";

class ActivityDashboard {
  constructor() {
    this.ws = null;
    this.clients = new Map();
    this.isConnected = false;
    this.startTime = Date.now();
  }

  connect() {
    console.clear();
    console.log("📊 WebSocket Server Activity Dashboard");
    console.log("=====================================");
    console.log("🔄 Connecting to server...");
    
    this.ws = new WebSocket("ws://localhost:8000");

    this.ws.on("open", () => {
      this.isConnected = true;
      console.log("✅ Connected to server");
      
      // Set dashboard name
      this.ws.send(JSON.stringify({
        type: 'set_name',
        name: 'Dashboard-Monitor'
      }));

      // Start monitoring
      this.startMonitoring();
    });

    this.ws.on("message", (data) => {
      this.handleMessage(JSON.parse(data.toString()));
    });

    this.ws.on("close", () => {
      this.isConnected = false;
      console.log("\n❌ Connection lost. Attempting to reconnect in 5 seconds...");
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on("error", (error) => {
      console.error("❌ WebSocket error:", error.message);
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'welcome':
        this.dashboardId = message.clientId;
        break;

      case 'client_list':
        this.updateClientList(message.clients);
        break;

      case 'user_broadcast':
        this.logActivity(`📢 ${message.from} broadcasted: ${message.message.substring(0, 50)}...`);
        break;

      case 'client_name_changed':
        this.logActivity(`📝 Client ${message.clientId} changed name: ${message.oldName} → ${message.newName}`);
        break;

      case 'client_disconnected':
        this.logActivity(`👋 ${message.name} disconnected`);
        break;

      case 'server_shutdown':
        this.logActivity(`🛑 Server shutdown: ${message.message}`);
        break;
    }
  }

  updateClientList(clientList) {
    this.clients.clear();
    clientList.forEach(client => {
      if (client.name !== 'Dashboard-Monitor') {
        this.clients.set(client.id, client);
      }
    });
    this.updateDisplay();
  }

  logActivity(message) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
  }

  startMonitoring() {
    // Request initial client list
    this.ws.send(JSON.stringify({
      type: 'get_clients'
    }));

    // Update display every 10 seconds
    setInterval(() => {
      if (this.isConnected) {
        this.ws.send(JSON.stringify({
          type: 'get_clients'
        }));
      }
    }, 10000);
  }

  updateDisplay() {
    // Clear screen and show header
    console.clear();
    console.log("📊 WebSocket Server Activity Dashboard");
    console.log("=====================================");
    
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    
    console.log(`⏱️  Dashboard Uptime: ${hours}h ${minutes}m ${seconds}s`);
    console.log(`📡 Connection Status: ${this.isConnected ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`👥 Active Clients: ${this.clients.size}`);
    console.log();

    if (this.clients.size > 0) {
      console.log("👤 Connected Clients:");
      console.log("━".repeat(60));
      console.log("ID    Name               Connected At        Last Activity");
      console.log("━".repeat(60));
      
      this.clients.forEach(client => {
        const id = String(client.id).padEnd(4);
        const name = client.name.padEnd(18);
        const connected = new Date(client.connected).toLocaleString().padEnd(18);
        const lastActivity = new Date(client.lastActivity).toLocaleString();
        
        console.log(`${id}  ${name}  ${connected}  ${lastActivity}`);
      });
    } else {
      console.log("📭 No active clients");
    }

    console.log();
    console.log("📋 Activity Log:");
    console.log("━".repeat(60));
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log("\n\n👋 Dashboard shutting down...");
  process.exit(0);
});

// Start the dashboard
const dashboard = new ActivityDashboard();
dashboard.connect();
