import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BufferMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";
import { DynamicTool } from "@langchain/core/tools";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// Load environment variables
dotenv.config();

interface CodeAnalysis {
  linesOfCode: number;
  functionsCount: number;
  conditionalStatements: number;
  complexityScore: number;
  complexityRating: 'Low' | 'Medium' | 'High';
  suggestions: string[];
}

interface SaveCodeResult {
  success: boolean;
  message: string;
  filepath?: string;
}

class OllamaLangChainAgent {
  private llm: ChatOllama;
  private memory: BufferMemory;
  private agent?: AgentExecutor;
  private tools: DynamicTool[];
  private conversationHistory: Array<HumanMessage | AIMessage | SystemMessage> = [];

  constructor() {
    // Initialize Ollama LLM with custom host
    this.llm = new ChatOllama({
      baseUrl: process.env.OLLAMA_HOST || "https://918cd814f71a.ngrok-free.app",
      model: process.env.OLLAMA_MODEL || "deepseek-coder:6.7b",
      temperature: 0.1,
      // Disable tools for models that don't support them
      // tools: undefined
    });

    // Initialize memory for conversation history
    this.memory = new BufferMemory({
      memoryKey: "chat_history",
      returnMessages: true,
    });

    // Initialize tools
    this.tools = this.createTools();

    // Add system message to conversation history
    this.conversationHistory.push(new SystemMessage(`You are a helpful coding assistant powered by Ollama. You are NOT OpenAI or ChatGPT.

You are an expert programming assistant specializing in:
- Code completion and suggestions
- Bug detection and fixing
- Code optimization and refactoring
- Explaining code functionality
- Writing tests for code
- Converting code between languages
- API documentation generation

Key instructions:
- Always remember our conversation history
- When asked about previous questions, refer to our chat history
- You have access to tools for saving code and analyzing complexity
- Always provide clear, well-commented, and production-ready code
- You are powered by Ollama, not OpenAI

Remember: You can see the full conversation history and should reference previous messages when asked.

When you need to save code or analyze complexity, use the available tools. Always explain your reasoning and provide helpful context.`));
  }

  private createTools(): DynamicTool[] {
    return [
      new DynamicTool({
        name: "save_code_snippet",
        description: "Save a code snippet to a file. Use this when the user asks you to save code or when you generate code that should be preserved.",
        func: async (input: string): Promise<string> => {
          try {
            const { filename, code, language } = JSON.parse(input);
            const result = await this.saveCodeSnippet(filename, code, language);
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({ 
              success: false, 
              message: `Error parsing input: ${error instanceof Error ? error.message : 'Unknown error'}` 
            });
          }
        },
      }),

      new DynamicTool({
        name: "analyze_code_complexity",
        description: "Analyze the complexity and quality of code. Use this when the user wants to understand code quality or when reviewing code.",
        func: async (input: string): Promise<string> => {
          try {
            const { code } = JSON.parse(input);
            const result = await this.analyzeCodeComplexity(code);
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({ 
              error: `Error analyzing code: ${error instanceof Error ? error.message : 'Unknown error'}` 
            });
          }
        },
      }),

      new DynamicTool({
        name: "search_documentation",
        description: "Search for API documentation or programming examples. Use this when the user asks about specific APIs, libraries, or programming concepts.",
        func: async (input: string): Promise<string> => {
          try {
            const { technology, query } = JSON.parse(input);
            const result = await this.searchDocumentation(technology, query);
            return JSON.stringify(result);
          } catch (error) {
            return JSON.stringify({ 
              error: `Error searching documentation: ${error instanceof Error ? error.message : 'Unknown error'}` 
            });
          }
        },
      }),

      new DynamicTool({
        name: "execute_code",
        description: "Execute simple JavaScript code snippets for testing or demonstration. Use this for small code examples that can be safely executed.",
        func: async (input: string): Promise<string> => {
          try {
            const { code } = JSON.parse(input);
            // Simple and safe code execution (only for demo purposes)
            const result = eval(code);
            return JSON.stringify({ 
              result: result,
              success: true,
              message: "Code executed successfully"
            });
          } catch (error) {
            return JSON.stringify({ 
              error: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              success: false
            });
          }
        },
      }),
    ];
  }

  private async saveCodeSnippet(filename: string, code: string, language?: string): Promise<SaveCodeResult> {
    try {
      const dir = './saved_snippets';
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const filepath = path.join(dir, filename);
      
      // Add language comment if provided
      let codeWithHeader = code;
      if (language) {
        const commentMap: { [key: string]: string } = {
          'javascript': '// ',
          'typescript': '// ',
          'python': '# ',
          'java': '// ',
          'cpp': '// ',
          'c': '// ',
          'rust': '// ',
          'go': '// ',
          'php': '// ',
          'ruby': '# ',
          'shell': '# ',
          'bash': '# '
        };
        
        const comment = commentMap[language.toLowerCase()] || '// ';
        codeWithHeader = `${comment}Language: ${language}\n${comment}Generated by Ollama LangChain Agent\n${comment}Date: ${new Date().toISOString()}\n\n${code}`;
      }
      
      fs.writeFileSync(filepath, codeWithHeader);
      
      return {
        success: true,
        message: `Code snippet saved to ${filepath}`,
        filepath: filepath
      };
    } catch (error) {
      return {
        success: false,
        message: `Error saving file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async analyzeCodeComplexity(code: string): Promise<CodeAnalysis> {
    const lines = code.split('\n').filter(line => line.trim() !== '');
    const functions = (code.match(/function\s+\w+|const\s+\w+\s*=\s*\(|class\s+\w+/g) || []).length;
    const conditionals = (code.match(/if\s*\(|switch\s*\(|while\s*\(|for\s*\(|\?\s*:/g) || []).length;
    const complexity = conditionals + functions;
    
    let rating: 'Low' | 'Medium' | 'High';
    const suggestions: string[] = [];
    
    if (complexity < 5) {
      rating = 'Low';
      suggestions.push('Code complexity is low and maintainable');
    } else if (complexity < 15) {
      rating = 'Medium';
      suggestions.push('Code complexity is moderate');
      if (functions > 5) suggestions.push('Consider organizing into modules or classes');
    } else {
      rating = 'High';
      suggestions.push('Consider breaking into smaller functions');
      suggestions.push('Reduce nesting levels where possible');
      suggestions.push('Consider using design patterns to simplify structure');
    }
    
    if (lines.length > 100) {
      suggestions.push('Consider splitting large files into smaller modules');
    }
    
    return {
      linesOfCode: lines.length,
      functionsCount: functions,
      conditionalStatements: conditionals,
      complexityScore: complexity,
      complexityRating: rating,
      suggestions
    };
  }

  private async searchDocumentation(technology: string, query: string): Promise<any> {
    // Mock documentation search (in real implementation, integrate with actual docs APIs)
    const mockResults: { [key: string]: { [key: string]: string } } = {
      'javascript': {
        'array methods': 'map(), filter(), reduce(), forEach(), find(), some(), every(), includes()',
        'promises': 'Promise.resolve(), Promise.reject(), async/await, .then(), .catch(), Promise.all()',
        'dom manipulation': 'document.querySelector(), addEventListener(), innerHTML, classList, createElement()',
        'modules': 'import/export, require(), module.exports, default exports'
      },
      'typescript': {
        'types': 'string, number, boolean, object, array, union types, interfaces',
        'generics': 'Generic functions, Generic classes, Type constraints',
        'decorators': '@decorator syntax, Class decorators, Method decorators'
      },
      'react': {
        'hooks': 'useState, useEffect, useContext, useReducer, useMemo, useCallback, useRef',
        'components': 'Function components, Class components, Props, State, JSX',
        'routing': 'React Router, useNavigate, useParams, Routes, Route, Link'
      },
      'node.js': {
        'file system': 'fs.readFile(), fs.writeFile(), fs.exists(), path.join(), fs.createReadStream()',
        'http': 'express, http.createServer(), req, res, middleware, app.get(), app.post()',
        'async': 'Promise, async/await, util.promisify(), stream, EventEmitter'
      },
      'python': {
        'data structures': 'list, dict, set, tuple, collections.deque, collections.defaultdict',
        'functions': 'def, lambda, *args, **kwargs, decorators, generators',
        'classes': 'class, __init__, inheritance, super(), @property'
      }
    };
    
    const techDocs = mockResults[technology.toLowerCase()] || {};
    const result = techDocs[query.toLowerCase()] || 'Documentation not found in cache. Try searching official documentation.';
    
    return {
      technology,
      query,
      result,
      suggestion: `For detailed documentation, visit the official ${technology} documentation website`,
      relatedTopics: Object.keys(techDocs).filter(key => key !== query.toLowerCase()).slice(0, 3)
    };
  }

  async initializeAgent(): Promise<void> {
    try {
      // Try to create agent with tools (some models may not support this)
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", "You are an expert programming assistant. Use the available tools when appropriate to help users with coding tasks."],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
      ]);

      // Create a simple agent without using the hub (since it might not be available)
      const agent = await createReactAgent({
        llm: this.llm,
        tools: this.tools,
        prompt: prompt,
      });

      this.agent = new AgentExecutor({
        agent,
        tools: this.tools,
        memory: this.memory,
        verbose: true,
        maxIterations: 3,
      });

      console.log("✅ Agent initialized with tools support");
    } catch (error) {
      console.log("⚠️  Agent with tools not supported, falling back to basic conversation");
      console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Fallback to basic conversation without tools
      this.agent = undefined;
    }
  }

  async chat(message: string, streaming: boolean = false): Promise<string> {
    try {
      if (streaming) {
        // Use streaming for immediate display
        return await this.streamChatInternal(message);
      } else if (this.agent) {
        // Use agent with tools
        const result = await this.agent.invoke({
          input: message,
        });
        return result.output;
      } else {
        // Fallback to basic conversation
        this.conversationHistory.push(new HumanMessage(message));
        
        const response = await this.llm.invoke(this.conversationHistory);
        
        this.conversationHistory.push(new AIMessage(response.content as string));
        
        return response.content as string;
      }
    } catch (error) {
      console.error("Chat error:", error);
      return `I apologize, but I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try rephrasing your question.`;
    }
  }

  private async streamChatInternal(message: string): Promise<string> {
    this.conversationHistory.push(new HumanMessage(message));
    
    console.log("\n🤖 AI: ");
    console.log("🔄 Connecting to Ollama...");
    
    try {
      const stream = await this.llm.stream(this.conversationHistory);
      let fullResponse = "";
      let isFirstToken = true;
      
      for await (const chunk of stream) {
        const token = chunk.content as string;
        
        if (isFirstToken) {
          // Clear the "Connecting..." message and start fresh
          process.stdout.write("\r🤖 AI: ");
          isFirstToken = false;
        }
        
        fullResponse += token;
        process.stdout.write(token); // Display tokens immediately
      }
      
      console.log(); // New line after streaming
      this.conversationHistory.push(new AIMessage(fullResponse));
      
      return fullResponse;
    } catch (error) {
      console.log(`\r🤖 AI: ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  async streamChat(message: string, onToken: (token: string) => void): Promise<void> {
    try {
      this.conversationHistory.push(new HumanMessage(message));
      
      const stream = await this.llm.stream(this.conversationHistory);
      let fullResponse = "";
      
      for await (const chunk of stream) {
        const token = chunk.content as string;
        fullResponse += token;
        onToken(token);
      }
      
      this.conversationHistory.push(new AIMessage(fullResponse));
    } catch (error) {
      console.error("Stream chat error:", error);
      onToken(`\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getConversationHistory(): Array<HumanMessage | AIMessage | SystemMessage> {
    return this.conversationHistory;
  }

  clearHistory(): void {
    this.conversationHistory = [this.conversationHistory[0]]; // Keep system message
    this.memory.clear();
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.llm.invoke([new HumanMessage("Hello")]);
      console.log("✅ Connection to Ollama successful");
      return true;
    } catch (error) {
      console.error("❌ Connection to Ollama failed:", error);
      return false;
    }
  }
}

// CLI Interface
class OllamaCLI {
  private agent: OllamaLangChainAgent;
  private rl: readline.Interface;

  constructor() {
    this.agent = new OllamaLangChainAgent();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start(): Promise<void> {
    console.log("🚀 Ollama LangChain Agent Starting...");
    console.log(`📡 Connecting to: ${process.env.OLLAMA_HOST}`);
    console.log(`🤖 Model: ${process.env.OLLAMA_MODEL}`);
    
    // Test connection
    const connected = await this.agent.testConnection();
    if (!connected) {
      console.log("❌ Failed to connect to Ollama. Please check your configuration.");
      process.exit(1);
    }

    // Initialize agent
    await this.agent.initializeAgent();
    
    console.log("\n" + "=".repeat(60));
    console.log("🤖 Welcome to Ollama LangChain Agent!");
    console.log("💡 I can help you with coding, debugging, and programming questions.");
    console.log("� All responses stream live for immediate feedback!");
    console.log("🧠 I remember our conversation history automatically.");
    console.log("�🔧 I have access to tools for saving code, analyzing complexity, and more.");
    console.log("📝 Type 'help' for commands, 'exit' to quit, 'clear' to clear history.");
    console.log("=".repeat(60) + "\n");

    this.chatLoop();
  }

  private chatLoop(): void {
    this.rl.question("\n💭 You: ", async (input) => {
      const command = input.trim().toLowerCase();

      switch (command) {
        case 'exit':
        case 'quit':
          console.log("👋 Goodbye!");
          this.rl.close();
          process.exit(0);
          break;

        case 'clear':
          this.agent.clearHistory();
          console.log("🗑️ Conversation history cleared.");
          this.chatLoop();
          break;

        case 'history':
          console.log("\n📚 Conversation History:");
          const history = this.agent.getConversationHistory();
          history.forEach((msg, index) => {
            if (msg instanceof HumanMessage) {
              console.log(`${index + 1}. 👤 You: ${msg.content}`);
            } else if (msg instanceof AIMessage) {
              console.log(`${index + 1}. 🤖 AI: ${msg.content}`);
            }
          });
          this.chatLoop();
          break;

        case 'help':
          this.showHelp();
          this.chatLoop();
          break;

        case 'no-stream':
          this.rl.question("💭 Message (no streaming): ", async (message) => {
            console.log("\n🤖 AI: ");
            const response = await this.agent.chat(message, false);
            console.log(response);
            this.chatLoop();
          });
          break;

        default:
          if (input.trim()) {
            // Use streaming by default for better UX
            await this.agent.chat(input, true);
          }
          this.chatLoop();
          break;
      }
    });
  }

  private showHelp(): void {
    console.log("\n📋 Available Commands:");
    console.log("  help       - Show this help message");
    console.log("  clear      - Clear conversation history");
    console.log("  history    - Show conversation history");
    console.log("  no-stream  - Send message without streaming (wait for full response)");
    console.log("  exit       - Exit the application");
    console.log("\n🚀 Default Behavior:");
    console.log("  - All messages stream by default for live output");
    console.log("  - Conversation history is preserved automatically");
    console.log("  - Tools are available when supported by the model");
    console.log("\n💡 Example queries:");
    console.log("  - Write a React component for a todo list");
    console.log("  - Explain async/await in JavaScript");
    console.log("  - Debug this code: [paste your code]");
    console.log("  - Save this code to a file: [your code]");
    console.log("  - Analyze the complexity of this function: [code]");
    console.log("  - What was my previous question?");
  }
}

// Main execution
async function main() {
  const cli = new OllamaCLI();
  await cli.start();
}

// Handle process termination
process.on('SIGINT', () => {
  console.log("\n\n👋 Goodbye!");
  process.exit(0);
});

// Export for use as module
export { OllamaLangChainAgent, OllamaCLI };

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}
