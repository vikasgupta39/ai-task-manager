# AI Task Manager

An intelligent task management application powered by Cloudflare Workers AI, demonstrating the integration of LLMs with Durable Objects for real-time state management.

![AI Task Manager](https://img.shields.io/badge/Cloudflare-Workers%20AI-F38020?style=flat&logo=cloudflare)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)

## 🎯 Project Overview

This project demonstrates building an AI-powered application on Cloudflare's edge infrastructure, showcasing:

1. **LLM Integration** - Workers AI (Llama 4 Scout) for natural language task management
2. **Durable Objects** - Agents SDK for real-time state coordination and persistence
3. **Chat Interface** - React-based conversational UI for user interaction
4. **Persistent Memory** - SQLite-backed storage with real-time WebSocket sync

## ✨ Features

### Core Task Management
- **Add tasks** via natural language: "add task buy groceries"
- **Complete tasks**: "mark groceries as done"
- **Remove tasks**: "delete the milk task"
- **List tasks**: "show my tasks"

### Advanced Features
- **📅 Due Dates**: "add task submit report by Friday"
- **🏷️ Categories**: "add task buy milk #shopping"
- **📊 Subtasks**: "add subtask buy eggs under groceries"
- **🎯 Priorities**: "set buy milk as high priority"
- **💡 Smart Suggestions**: "I have 15 minutes, what should I do?"
- **📈 Daily Summary**: "give me a daily summary"

### Interactive UI
- Real-time task updates via WebSocket
- Click to complete/remove tasks from sidebar
- Category tags and due date badges
- Priority indicators (🔴 high, 🟡 medium, 🟢 low)
- Overdue task warnings
- Clear chat functionality
- Dark theme with responsive design

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   React App     │────▶│  Cloudflare Worker   │────▶│   Workers AI    │
│  (Chat + UI)    │     │  (Durable Object)    │     │ (Llama 4 Scout) │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                         │
        │ WebSocket               │ SQLite
        └─────────────────────────┴──────────────────▶ Persistent State
```

### Tech Stack
- **Runtime**: Cloudflare Workers + Durable Objects
- **AI Model**: `@cf/meta/llama-4-scout-17b-16e-instruct`
- **Framework**: Agents SDK (`agents`, `@cloudflare/ai-chat`)
- **Frontend**: React 19, TypeScript, Vite
- **AI SDK**: Vercel AI SDK v7 with `workers-ai-provider`

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Cloudflare account with Workers AI access
- Wrangler CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ai-task-manager.git
cd ai-task-manager

# Install dependencies
npm install

# Run locally
npm run dev
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

## 📁 Project Structure

```
ai-task-manager/
├── src/
│   ├── server.ts      # Durable Object agent with AI and tools
│   ├── app.tsx        # React chat UI and task sidebar
│   ├── client.tsx     # React entry point
│   └── styles.css     # Dark theme styling
├── index.html         # HTML template
├── wrangler.jsonc     # Cloudflare configuration
├── vite.config.ts     # Vite build configuration
├── tsconfig.json      # TypeScript configuration
└── package.json       # Dependencies and scripts
```

## 🛠️ How It Works

### Natural Language Processing
The AI interprets user messages and outputs tool calls in a specific format:
```
User: "add task buy milk #shopping by tomorrow"
AI: [addTask(title="buy milk", category="shopping", dueDate="tomorrow")]
```

The server parses these tool calls and executes them, updating the Durable Object state.

### Real-time State Sync
- Tasks are stored in Durable Object state (SQLite-backed)
- WebSocket connection syncs state to all connected clients
- React UI updates immediately via `onStateUpdate` callback

### Tool Implementation
The agent implements these tools:
- `addTask` - Create task with optional due date, category, priority, parent
- `completeTask` - Mark a task as done
- `removeTask` - Delete a task (and its subtasks)
- `listTasks` - Show all tasks or filter by category
- `dailySummary` - Overview with statistics and focus suggestions
- `suggest` - Smart suggestions based on context
- `setPriority` - Set task priority level
- `clearAll` - Remove all tasks

## 📋 Example Commands

```
# Basic task management
"add task call mom"
"complete the call mom task"
"remove task call mom"

# With due dates
"add task submit report by Friday"
"add task meeting tomorrow"

# With categories
"add task buy eggs #shopping"
"show my shopping tasks"

# With priorities
"add task urgent meeting #work"
"set urgent meeting as high priority"

# Subtasks
"add subtask buy bread under groceries"

# Smart features
"give me a daily summary"
"I have 15 minutes, what should I do?"
"I'm feeling productive"
```

## 🔧 Configuration

### Wrangler Configuration (wrangler.jsonc)
```json
{
  "name": "ai-task-manager",
  "main": "src/server.ts",
  "compatibility_date": "2025-01-01",
  "ai": { "binding": "AI" },
  "durable_objects": {
    "bindings": [{
      "name": "TaskManagerAgent",
      "class_name": "TaskManagerAgent"
    }]
  }
}
```

## 🤖 AI-Assisted Development

This project was developed using AI-assisted coding with **Kiro** (Claude-based AI coding environment).

### Developer's Role
- **Vision & Requirements**: Defined the 4 core requirements (LLM, Durable Objects, Chat UI, Persistent State)
- **Feature Direction**: Requested due dates, categories, subtasks, smart suggestions, interactive sidebar
- **Architecture Decisions**: Chose simplified HTTP + WebSocket hybrid approach after evaluating options
- **Quality Assurance**: Tested features, reported issues, guided iterations

### AI's Role
- **Rapid Implementation**: Translated requirements into working code quickly
- **Debugging**: Investigated streaming bugs, WebSocket issues, tool call problems
- **Code Generation**: React components, CSS styling, server logic
- **Documentation**: README, code comments, deployment scripts



## 📄 License

MIT License - feel free to use this project as a reference or starting point.

## 🙏 Acknowledgments

- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [Kiro AI IDE](https://kiro.dev/)
