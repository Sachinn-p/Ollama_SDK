import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-coder:6.7b';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'https://918cd814f71a.ngrok-free.app';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store chat sessions in memory (in production, use a database)
const chatSessions = new Map();

// Helper functions for direct Ollama API calls
async function callOllamaChat(messages, stream = false) {
  const payload = {
    model: OLLAMA_MODEL,
    messages: messages,
    stream: stream
  };

  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  return response;
}

async function callOllamaGenerate(prompt, stream = false) {
  const payload = {
    model: OLLAMA_MODEL,
    prompt: prompt,
    stream: stream
  };

  const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  return response;
}

async function getOllamaModels() {
  const response = await fetch(`${OLLAMA_HOST}/api/tags`);
  
  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// Cache tool support status to avoid repeated checks
let toolsSupportCache = null;
let toolsSupportChecked = false;

// System prompt for code completion
const SYSTEM_PROMPT = `You are an expert programming assistant specializing in code completion, explanation, and optimization. 

Your capabilities include:
- Code completion and suggestions
- Bug detection and fixing
- Code optimization and refactoring
- Explaining code functionality
- Writing tests for code
- Converting code between languages
- API documentation generation

Always provide clear, well-commented, and production-ready code. When possible, include multiple approaches or alternatives.`;

// Available tools for the AI
const AVAILABLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'save_code_snippet',
      description: 'Save a code snippet to a file',
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'The filename to save the code to'
          },
          code: {
            type: 'string',
            description: 'The code content to save'
          },
          language: {
            type: 'string',
            description: 'Programming language of the code'
          }
        },
        required: ['filename', 'code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_code_complexity',
      description: 'Analyze the complexity and quality of code',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The code to analyze'
          }
        },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_documentation',
      description: 'Search for API documentation or examples',
      parameters: {
        type: 'object',
        properties: {
          technology: {
            type: 'string',
            description: 'The technology or library to search for'
          },
          query: {
            type: 'string',
            description: 'What to search for'
          }
        },
        required: ['technology', 'query']
      }
    }
  }
];

// Tool execution functions
const toolFunctions = {
  save_code_snippet: async (args) => {
    try {
      const { filename, code, language } = args;
      const dir = './saved_snippets';
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, code);
      
      return {
        success: true,
        message: `Code snippet saved to ${filepath}`,
        filepath: filepath
      };
    } catch (error) {
      return {
        success: false,
        message: `Error saving file: ${error.message}`
      };
    }
  },

  analyze_code_complexity: async (args) => {
    const { code } = args;
    
    // Simple complexity analysis
    const lines = code.split('\n').filter(line => line.trim() !== '');
    const functions = (code.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length;
    const conditionals = (code.match(/if\s*\(|switch\s*\(|while\s*\(|for\s*\(/g) || []).length;
    const complexity = conditionals + functions;
    
    let rating;
    if (complexity < 5) rating = 'Low';
    else if (complexity < 15) rating = 'Medium';
    else rating = 'High';
    
    return {
      analysis: {
        lines_of_code: lines.length,
        functions_count: functions,
        conditional_statements: conditionals,
        complexity_score: complexity,
        complexity_rating: rating,
        suggestions: complexity > 15 ? ['Consider breaking into smaller functions', 'Reduce nesting levels'] : ['Code complexity is acceptable']
      }
    };
  },

  search_documentation: async (args) => {
    const { technology, query } = args;
    
    // Mock documentation search (in real implementation, integrate with actual docs)
    const mockResults = {
      'javascript': {
        'array methods': 'map(), filter(), reduce(), forEach(), find(), some(), every()',
        'promises': 'Promise.resolve(), Promise.reject(), async/await, .then(), .catch()',
        'dom manipulation': 'document.querySelector(), addEventListener(), innerHTML, classList'
      },
      'react': {
        'hooks': 'useState, useEffect, useContext, useReducer, useMemo, useCallback',
        'components': 'Function components, Class components, Props, State',
        'routing': 'React Router, useNavigate, useParams, Routes, Route'
      },
      'node.js': {
        'file system': 'fs.readFile(), fs.writeFile(), fs.exists(), path.join()',
        'http': 'express, http.createServer(), req, res, middleware',
        'async': 'Promise, async/await, util.promisify(), stream'
      }
    };
    
    const techDocs = mockResults[technology.toLowerCase()] || {};
    const result = techDocs[query.toLowerCase()] || 'Documentation not found in cache';
    
    return {
      technology,
      query,
      result,
      suggestion: 'For detailed documentation, visit the official docs'
    };
  }
};

// Get or create chat session
function getSession(sessionId) {
  if (!chatSessions.has(sessionId)) {
    chatSessions.set(sessionId, {
      id: sessionId,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        }
      ],
      created: new Date(),
      lastActivity: new Date()
    });
  }
  return chatSessions.get(sessionId);
}

// Execute tool function
async function executeTool(toolCall) {
  const { name, arguments: args } = toolCall.function;
  
  if (toolFunctions[name]) {
    try {
      const result = await toolFunctions[name](JSON.parse(args));
      return {
        tool_call_id: toolCall.id,
        result: JSON.stringify(result)
      };
    } catch (error) {
      return {
        tool_call_id: toolCall.id,
        result: JSON.stringify({ error: error.message })
      };
    }
  }
  
  return {
    tool_call_id: toolCall.id,
    result: JSON.stringify({ error: 'Tool not found' })
  };
}

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Code Completer API</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .method { color: #007bff; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>🚀 Code Completer API</h1>
        <p>An AI-powered code completion service using Ollama SDK</p>
        
        <h2>Available Endpoints:</h2>
        
        <div class="endpoint">
            <span class="method">POST</span> <code>/chat/:sessionId</code>
            <p>Send a message to the AI with chat history support</p>
        </div>
        
        <div class="endpoint">
            <span class="method">GET</span> <code>/chat/:sessionId/stream</code>
            <p>Get streaming responses via Server-Sent Events</p>
        </div>
        
        <div class="endpoint">
            <span class="method">GET</span> <code>/sessions/:sessionId</code>
            <p>Get chat session history</p>
        </div>
        
        <div class="endpoint">
            <span class="method">DELETE</span> <code>/sessions/:sessionId</code>
            <p>Clear chat session</p>
        </div>
        
        <div class="endpoint">
            <span class="method">GET</span> <code>/models</code>
            <p>List available Ollama models</p>
        </div>
        
        <h2>Features:</h2>
        <ul>
            <li>✅ Chat history persistence</li>
            <li>✅ System prompts for code assistance</li>
            <li>✅ Tool support (save code, analyze complexity, search docs)</li>
            <li>✅ Streaming responses via SSE</li>
            <li>✅ Session management</li>
        </ul>
        
        <h2>Example Usage:</h2>
        <pre>
// Send a coding question
POST /chat/my-session
{
  "message": "Write a React component for a todo list",
  "stream": false
}

// Stream a response
GET /chat/my-session/stream?message=Explain async/await in JavaScript
        </pre>
    </body>
    </html>
  `);
});

// Check if model supports tools
async function modelSupportsTools(modelName) {
  // Return cached result if already checked
  if (toolsSupportChecked) {
    return toolsSupportCache;
  }
  
  try {
    // Try a simple test call with tools to see if the model supports them
    const testResponse = await ollamaClient.chat({
      model: modelName,
      messages: [{ role: 'user', content: 'hello' }],
      tools: AVAILABLE_TOOLS, // Use actual tools to test
      stream: false
    });
    toolsSupportCache = true;
    toolsSupportChecked = true;
    return true;
  } catch (error) {
    console.log('Tool support check error:', error.message);
    if (error.message && error.message.includes('does not support tools')) {
      toolsSupportCache = false;
      toolsSupportChecked = true;
      return false;
    }
    // For any other error, assume no tool support to be safe
    toolsSupportCache = false;
    toolsSupportChecked = true;
    return false;
  }
}

// Send message to AI
app.post('/chat/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, stream = false } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const session = getSession(sessionId);
    session.lastActivity = new Date();
    
    // Add user message to history
    session.messages.push({
      role: 'user',
      content: message
    });
    
    // Check if model supports tools
    const supportsTools = await modelSupportsTools(OLLAMA_MODEL);
    const chatOptions = {
      model: OLLAMA_MODEL,
      messages: session.messages,
      stream: stream
    };
    
    // Only add tools if the model supports them
    if (supportsTools) {
      chatOptions.tools = AVAILABLE_TOOLS;
    }
    
    if (stream) {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      let fullResponse = '';
      
      // Stream response
      const response = await ollamaClient.chat(chatOptions);
      
      for await (const chunk of response) {
        if (chunk.message?.content) {
          fullResponse += chunk.message.content;
          res.write(`data: ${JSON.stringify({
            type: 'content',
            content: chunk.message.content
          })}\n\n`);
        }
        
        if (chunk.message?.tool_calls && supportsTools) {
          // Handle tool calls
          for (const toolCall of chunk.message.tool_calls) {
            const toolResult = await executeTool(toolCall);
            res.write(`data: ${JSON.stringify({
              type: 'tool_result',
              tool: toolCall.function.name,
              result: toolResult.result
            })}\n\n`);
          }
        }
        
        if (chunk.done) {
          // Add assistant response to history
          session.messages.push({
            role: 'assistant',
            content: fullResponse
          });
          
          res.write(`data: ${JSON.stringify({
            type: 'done',
            full_response: fullResponse
          })}\n\n`);
          res.end();
        }
      }
    } else {
      // Non-streaming response
      const response = await ollamaClient.chat(chatOptions);
      
      // Handle tool calls if any and if model supports tools
      if (response.message.tool_calls && supportsTools) {
        const toolResults = [];
        for (const toolCall of response.message.tool_calls) {
          const result = await executeTool(toolCall);
          toolResults.push(result);
        }
        
        // Add tool results and get final response
        session.messages.push(response.message);
        session.messages.push({
          role: 'tool',
          content: JSON.stringify(toolResults)
        });
        
        const finalResponse = await ollamaClient.chat({
          model: OLLAMA_MODEL,
          messages: session.messages
        });
        
        session.messages.push(finalResponse.message);
        
        res.json({
          response: finalResponse.message.content,
          session_id: sessionId,
          tool_results: toolResults,
          message_count: session.messages.length,
          tools_supported: supportsTools
        });
      } else {
        // Add assistant response to history
        session.messages.push(response.message);
        
        res.json({
          response: response.message.content,
          session_id: sessionId,
          message_count: session.messages.length,
          tools_supported: supportsTools
        });
      }
    }
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stream chat responses via SSE
app.get('/chat/:sessionId/stream', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.query;
    
    if (!message) {
      return res.status(400).json({ error: 'Message parameter is required' });
    }
    
    const session = getSession(sessionId);
    session.lastActivity = new Date();
    
    // Add user message to history
    session.messages.push({
      role: 'user',
      content: message
    });
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    let fullResponse = '';
    
    // Check if model supports tools
    const supportsTools = await modelSupportsTools(OLLAMA_MODEL);
    const chatOptions = {
      model: OLLAMA_MODEL,
      messages: session.messages,
      stream: true
    };
    
    // Only add tools if the model supports them
    if (supportsTools) {
      chatOptions.tools = AVAILABLE_TOOLS;
    }
    
    // Stream response
    const response = await ollamaClient.chat(chatOptions);
    
    for await (const chunk of response) {
      if (chunk.message?.content) {
        fullResponse += chunk.message.content;
        res.write(`data: ${JSON.stringify({
          type: 'content',
          content: chunk.message.content
        })}\n\n`);
      }
      
      if (chunk.done) {
        // Add assistant response to history
        session.messages.push({
          role: 'assistant',
          content: fullResponse
        });
        
        res.write(`data: ${JSON.stringify({
          type: 'done',
          full_response: fullResponse
        })}\n\n`);
        res.end();
      }
    }
  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
});

// Get session history
app.get('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = chatSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    session_id: sessionId,
    created: session.created,
    last_activity: session.lastActivity,
    message_count: session.messages.length,
    messages: session.messages.filter(m => m.role !== 'system') // Exclude system prompt
  });
});

// Clear session
app.delete('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
    res.json({ message: 'Session cleared successfully' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// List available models
app.get('/models', async (req, res) => {
  try {
    const models = await ollamaClient.list();
    res.json({
      current_model: OLLAMA_MODEL,
      available_models: models.models
    });
  } catch (error) {
    console.error('Models error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const supportsTools = await modelSupportsTools(OLLAMA_MODEL);
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      active_sessions: chatSessions.size,
      ollama_host: OLLAMA_HOST,
      model: OLLAMA_MODEL,
      tools_supported: supportsTools,
      available_tools: supportsTools ? AVAILABLE_TOOLS.length : 0
    });
  } catch (error) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      active_sessions: chatSessions.size,
      ollama_host: OLLAMA_HOST,
      model: OLLAMA_MODEL,
      tools_supported: false,
      available_tools: 0,
      note: 'Could not check tool support'
    });
  }
});

// Initialize and check tool support
async function initializeServer() {
  console.log(`🚀 Code Completer API running on http://localhost:${PORT}`);
  console.log(`📡 Ollama Host: ${OLLAMA_HOST}`);
  console.log(`🤖 Default Model: ${OLLAMA_MODEL}`);
  
  // Check tool support
  const supportsTools = await modelSupportsTools(OLLAMA_MODEL);
  console.log(`🛠️  Tools Support: ${supportsTools ? '✅ Enabled' : '❌ Not Supported'}`);
  console.log(`🔧 Available Tools: ${supportsTools ? AVAILABLE_TOOLS.length : 0}`);
  
  console.log('\n📋 Endpoints:');
  console.log(`   POST   /chat/:sessionId`);
  console.log(`   GET    /chat/:sessionId/stream`);
  console.log(`   GET    /sessions/:sessionId`);
  console.log(`   DELETE /sessions/:sessionId`);
  console.log(`   GET    /models`);
  console.log(`   GET    /health`);
}

// Start server
app.listen(PORT, () => {
  initializeServer();
});
