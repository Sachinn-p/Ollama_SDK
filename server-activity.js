import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama2";

// Store client information
const clients = new Map();
let clientIdCounter = 0;

// Create WebSocket server
const wss = new WebSocketServer({ port: 8000 });

// Client activity tracking
function logClientActivity(clientId, activity, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`📊 [${timestamp}] Client ${clientId}: ${activity}`, data);
}

// Broadcast to all clients
function broadcast(message, excludeClientId = null) {
  clients.forEach((client, id) => {
    if (id !== excludeClientId && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify({
        type: 'broadcast',
        message: message,
        timestamp: new Date().toISOString()
      }));
    }
  });
}

// Send client list to all clients
function sendClientList() {
  const clientList = Array.from(clients.entries()).map(([id, client]) => ({
    id,
    name: client.name,
    connected: new Date(client.connectedAt).toISOString(),
    lastActivity: client.lastActivity
  }));

  broadcast({
    type: 'client_list',
    clients: clientList
  });
}

wss.on("connection", (ws, req) => {
  const clientId = ++clientIdCounter;
  const clientInfo = {
    ws,
    name: `Client-${clientId}`,
    connectedAt: Date.now(),
    lastActivity: Date.now(),
    ip: req.socket.remoteAddress,
    userAgent: req.headers['user-agent']
  };

  clients.set(clientId, clientInfo);
  
  logClientActivity(clientId, 'CONNECTED', {
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent
  });

  // Send welcome message with client info
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId: clientId,
    message: `Welcome! You are Client ${clientId}`,
    connectedClients: clients.size
  }));

  // Send client list to all clients
  sendClientList();

  ws.on("message", async (msg) => {
    try {
      clientInfo.lastActivity = Date.now();
      
      const data = JSON.parse(msg.toString());
      
      logClientActivity(clientId, 'MESSAGE_RECEIVED', {
        type: data.type || 'chat',
        prompt: data.prompt?.substring(0, 50) + '...'
      });

      // Handle different message types
      switch (data.type) {
        case 'chat':
          await handleChatMessage(clientId, data);
          break;
        case 'set_name':
          handleSetName(clientId, data.name);
          break;
        case 'get_clients':
          handleGetClients(clientId);
          break;
        case 'broadcast':
          handleBroadcast(clientId, data.message);
          break;
        default:
          // Default to chat if no type specified
          await handleChatMessage(clientId, data);
      }

    } catch (parseErr) {
      logClientActivity(clientId, 'PARSE_ERROR', { error: parseErr.message });
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  // Handle chat messages with Ollama
  async function handleChatMessage(clientId, data) {
    const client = clients.get(clientId);
    if (!client) return;

    try {
      const payload = {
        model: data.model || OLLAMA_MODEL,
        prompt: data.prompt,
        stream: true
      };

      logClientActivity(clientId, 'OLLAMA_REQUEST', {
        model: payload.model,
        prompt: payload.prompt.substring(0, 100) + '...'
      });

      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        logClientActivity(clientId, 'OLLAMA_ERROR', { status: response.status });
        client.ws.send(JSON.stringify({
          type: 'error',
          message: `❌ Error connecting to Ollama: ${response.status}`
        }));
        return;
      }

      // Handle streaming response
      let buffer = '';
      let responseTokens = 0;
      
      response.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const responseData = JSON.parse(line);

            if (responseData.response) {
              responseTokens++;
              client.ws.send(JSON.stringify({
                type: 'stream',
                content: responseData.response
              }));
            }

            if (responseData.done) {
              logClientActivity(clientId, 'OLLAMA_COMPLETE', {
                tokens: responseTokens,
                model: payload.model
              });
              
              client.ws.send(JSON.stringify({
                type: 'stream_end',
                message: 'Generation complete',
                stats: {
                  tokens: responseTokens,
                  model: payload.model
                }
              }));
            }
          } catch (parseErr) {
            console.error("Bad JSON from Ollama:", line);
          }
        }
      });

      response.body.on('end', () => {
        if (buffer.trim()) {
          try {
            const responseData = JSON.parse(buffer);
            if (responseData.done) {
              client.ws.send(JSON.stringify({
                type: 'stream_end',
                message: 'Generation complete'
              }));
            }
          } catch (parseErr) {
            console.error("Bad final JSON from Ollama:", buffer);
          }
        }
      });

      response.body.on('error', (err) => {
        logClientActivity(clientId, 'STREAM_ERROR', { error: err.message });
        client.ws.send(JSON.stringify({
          type: 'error',
          message: 'Stream error occurred'
        }));
      });

    } catch (err) {
      logClientActivity(clientId, 'SERVER_ERROR', { error: err.message });
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Internal server error'
      }));
    }
  }

  // Handle setting client name
  function handleSetName(clientId, newName) {
    const client = clients.get(clientId);
    if (!client) return;

    const oldName = client.name;
    client.name = newName || `Client-${clientId}`;
    
    logClientActivity(clientId, 'NAME_CHANGED', {
      oldName,
      newName: client.name
    });

    client.ws.send(JSON.stringify({
      type: 'name_set',
      name: client.name,
      message: `Name changed to: ${client.name}`
    }));

    // Broadcast name change to other clients
    broadcast({
      type: 'client_name_changed',
      clientId,
      oldName,
      newName: client.name
    }, clientId);

    sendClientList();
  }

  // Handle get clients request
  function handleGetClients(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    const clientList = Array.from(clients.entries()).map(([id, c]) => ({
      id,
      name: c.name,
      connected: new Date(c.connectedAt).toLocaleString(),
      lastActivity: new Date(c.lastActivity).toLocaleString(),
      isYou: id === clientId
    }));

    client.ws.send(JSON.stringify({
      type: 'client_list',
      clients: clientList
    }));

    logClientActivity(clientId, 'REQUESTED_CLIENT_LIST');
  }

  // Handle broadcast message
  function handleBroadcast(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    logClientActivity(clientId, 'BROADCAST_SENT', { message: message.substring(0, 50) + '...' });

    broadcast({
      type: 'user_broadcast',
      from: client.name,
      fromId: clientId,
      message: message,
      timestamp: new Date().toISOString()
    }, clientId);

    client.ws.send(JSON.stringify({
      type: 'broadcast_sent',
      message: 'Message broadcasted to all clients'
    }));
  }

  ws.on("close", () => {
    logClientActivity(clientId, 'DISCONNECTED');
    clients.delete(clientId);
    
    // Notify other clients
    broadcast({
      type: 'client_disconnected',
      clientId,
      name: clientInfo.name,
      message: `${clientInfo.name} disconnected`
    });

    sendClientList();
  });

  ws.on("error", (error) => {
    logClientActivity(clientId, 'CONNECTION_ERROR', { error: error.message });
  });
});

// Server statistics
setInterval(() => {
  const stats = {
    totalClients: clients.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
  
  console.log(`📈 Server Stats: ${stats.totalClients} clients connected, uptime: ${Math.floor(stats.uptime)}s`);
}, 30000); // Every 30 seconds

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  
  // Notify all clients
  broadcast({
    type: 'server_shutdown',
    message: 'Server is shutting down'
  });
  
  // Close all connections
  clients.forEach((client) => {
    client.ws.close();
  });
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

console.log("🚀 WebSocket server with client activity tracking running at ws://localhost:8000");
console.log("📊 Features:");
console.log("   - Client activity logging");
console.log("   - Multi-client support");
console.log("   - Broadcasting between clients");
console.log("   - Client naming and management");
console.log("   - Real-time statistics");
