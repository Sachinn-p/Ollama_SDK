# 🚀 Ollama LangChain Agent

A powerful TypeScript-based AI agent using LangChain to connect to Ollama with advanced features like memory, system prompts, and tool calls.

## ✨ Features

- **🧠 Memory**: Persistent conversation history across interactions
- **🎯 System Prompts**: Specialized prompting for coding assistance  
- **🔧 Tools Integration**: Built-in tools for code operations
- **📡 Custom Host**: Connect to any Ollama instance via URL
- **💻 TypeScript**: Full type safety and modern development experience
- **🎮 Interactive CLI**: Command-line interface for easy interaction

## 🛠️ Available Tools

1. **`save_code_snippet`**: Save code to files with automatic headers
2. **`analyze_code_complexity`**: Analyze code quality and complexity
3. **`search_documentation`**: Search programming documentation (mock)
4. **`execute_code`**: Execute simple JavaScript snippets safely

## 🚀 Quick Start

### Installation

```bash
cd langchain-ollama
npm install
```

### Configuration

Create or update `.env` file:

```env
OLLAMA_HOST=https://918cd814f71a.ngrok-free.app
OLLAMA_MODEL=deepseek-coder:6.7b
PORT=3000
```

### Run the Agent

#### Development Mode (with TypeScript)
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

#### Test the Agent
```bash
npx ts-node src/test-agent.ts
```

## 🎮 CLI Commands

- `help` - Show available commands
- `clear` - Clear conversation history  
- `history` - Show conversation history
- `stream` - Enable streaming response mode
- `exit` - Exit the application

## 💡 Example Usage

### Basic Conversation
```
💭 You: Write a React component for a todo list

🤖 AI: [Generates React component with hooks, state management, etc.]
```

### Code Analysis
```
💭 You: Analyze the complexity of this function: [paste code]

🤖 AI: [Uses analyze_code_complexity tool to provide detailed analysis]
```

### Saving Code
```
💭 You: Save the React component to a file called TodoList.jsx

🤖 AI: [Uses save_code_snippet tool to save the code with proper headers]
```

### Streaming Mode
```
💭 You: stream
💭 Message for streaming: Explain async/await in JavaScript

🤖 AI (streaming): [Real-time token-by-token response]
```

## 🏗️ Architecture

### Core Components

- **`OllamaLangChainAgent`**: Main agent class with LangChain integration
- **`OllamaCLI`**: Interactive command-line interface
- **Tools**: Extensible tool system for code operations
- **Memory**: Conversation history management

### LangChain Integration

- **ChatOllama**: LLM interface for Ollama models
- **BufferMemory**: Conversation memory management
- **DynamicTool**: Custom tool creation and execution
- **AgentExecutor**: Agent orchestration with tool calling

## 🔧 Development

### Project Structure
```
langchain-ollama/
├── src/
│   ├── ollama-agent.ts     # Main agent implementation
│   └── test-agent.ts       # Test script
├── dist/                   # Compiled JavaScript (after build)
├── saved_snippets/         # Code snippets saved by agent
├── .env                    # Environment configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Project dependencies
```

### Building
```bash
npm run build  # Compile TypeScript to JavaScript
npm run clean  # Remove compiled files
```

## 🌟 Key Advantages

1. **🔄 Persistent Memory**: Conversations maintain context across interactions
2. **🎯 Specialized AI**: System prompt optimized for coding assistance
3. **🔧 Tool Integration**: AI can perform actions like saving files and analyzing code
4. **📡 Flexible Hosting**: Works with any Ollama instance (local or remote)
5. **💻 Type Safety**: Full TypeScript support with proper error handling
6. **🎮 User-Friendly**: Interactive CLI with helpful commands

## 🔗 Ollama Connection

The agent connects to your Ollama instance at:
- **Host**: `https://918cd814f71a.ngrok-free.app`
- **Model**: `deepseek-coder:6.7b`

### Supported Models

- Any Ollama-compatible model
- Automatic fallback for models without tool support
- Streaming support for real-time responses

## 🛡️ Error Handling

- Graceful degradation when tools aren't supported
- Connection retry logic
- Comprehensive error messages
- Safe code execution environment

## 📚 Dependencies

- **@langchain/ollama**: Ollama integration for LangChain
- **@langchain/core**: Core LangChain functionality
- **@langchain/community**: Community tools and integrations
- **langchain**: Main LangChain library
- **typescript**: TypeScript language support
- **ts-node**: TypeScript execution for Node.js
- **dotenv**: Environment variable management

## 🤝 Contributing

Feel free to extend the agent with additional tools, improve error handling, or add new features!

## 📄 License

ISC License
