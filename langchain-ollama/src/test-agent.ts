import { OllamaLangChainAgent } from './ollama-agent';
import * as dotenv from 'dotenv';

dotenv.config();

async function testAgent() {
  console.log("🧪 Testing Ollama LangChain Agent...\n");

  const agent = new OllamaLangChainAgent();
  
  // Test connection
  console.log("1. Testing connection...");
  const connected = await agent.testConnection();
  if (!connected) {
    console.log("❌ Connection failed. Exiting.");
    return;
  }

  // Initialize agent
  console.log("2. Initializing agent...");
  await agent.initializeAgent();

  // Test basic conversation
  console.log("3. Testing basic conversation...");
  const response1 = await agent.chat("Hello! Can you explain what you can help me with?");
  console.log("🤖 Response:", response1);

  // Test coding question
  console.log("\n4. Testing coding assistance...");
  const response2 = await agent.chat("Write a simple JavaScript function to reverse a string");
  console.log("🤖 Response:", response2);

  // Test tool usage (save code)
  console.log("\n5. Testing tool usage...");
  const response3 = await agent.chat("Save the string reverse function you just wrote to a file called 'reverse-string.js'");
  console.log("🤖 Response:", response3);

  // Test code analysis
  console.log("\n6. Testing code analysis...");
  const codeToAnalyze = `
function complexFunction(data) {
  if (data && data.length > 0) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].type === 'special') {
        if (data[i].value > 100) {
          if (data[i].category === 'important') {
            return data[i].process();
          }
        }
      }
    }
  }
  return null;
}`;

  const response4 = await agent.chat(`Analyze the complexity of this code: ${codeToAnalyze}`);
  console.log("🤖 Response:", response4);

  console.log("\n✅ Test completed!");
}

// Run test
testAgent().catch(console.error);
