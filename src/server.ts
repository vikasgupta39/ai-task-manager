import { Agent, routeAgentRequest } from "agents";
import type { Connection, ConnectionContext } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";

// ── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  dueDate?: string;        // ISO date string or natural language like "Friday"
  category?: string;       // Tag like "shopping", "work", "personal"
  parentId?: string;       // For subtasks - references parent task id
  priority?: "high" | "medium" | "low";
}

interface AgentState {
  tasks: Task[];
}

interface ChatRequest {
  message: string;
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function parseDueDate(text: string): string | undefined {
  const today = new Date();
  const lowerText = text.toLowerCase();
  
  // Parse relative dates
  if (lowerText.includes("today")) {
    return today.toISOString().split("T")[0];
  }
  if (lowerText.includes("tomorrow")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }
  
  // Parse day names
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (const day of days) {
    if (lowerText.includes(day)) {
      const targetDay = days.indexOf(day);
      const currentDay = today.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate.toISOString().split("T")[0];
    }
  }
  
  // Parse "in X days"
  const inDaysMatch = lowerText.match(/in (\d+) days?/);
  if (inDaysMatch) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + parseInt(inDaysMatch[1]));
    return targetDate.toISOString().split("T")[0];
  }
  
  // Parse "next week"
  if (lowerText.includes("next week")) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + 7);
    return targetDate.toISOString().split("T")[0];
  }
  
  return undefined;
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return `⚠️ Overdue by ${Math.abs(diffDays)} day(s)`;
  if (diffDays === 0) return "📅 Due today";
  if (diffDays === 1) return "📅 Due tomorrow";
  if (diffDays <= 7) return `📅 Due in ${diffDays} days`;
  return `📅 Due ${date.toLocaleDateString()}`;
}

// ── Agent ────────────────────────────────────────────────────────────────────

export class TaskManagerAgent extends Agent<Env, AgentState> {
  initialState: AgentState = { tasks: [] };

  // ── Tool implementations ───────────────────────────────────────────────────
  
  private addTask(title: string, dueDate?: string, category?: string, parentId?: string, priority?: string): string {
    const currentTasks = [...(this.state?.tasks ?? [])];
    
    // Check for duplicates (only among non-subtasks or same parent)
    const isDuplicate = currentTasks.some(t => 
      t.title.toLowerCase() === title.toLowerCase() && 
      t.parentId === parentId
    );
    if (isDuplicate) {
      return `Task "${title}" already exists.`;
    }

    // If parentId provided, verify parent exists
    if (parentId) {
      const parent = currentTasks.find(t => 
        t.id === parentId || 
        t.title.toLowerCase().includes(parentId.toLowerCase())
      );
      if (!parent) {
        return `Parent task "${parentId}" not found.`;
      }
      parentId = parent.id; // Use actual ID
    }
    
    const newTask: Task = {
      id: crypto.randomUUID().slice(0, 8),
      title,
      completed: false,
      createdAt: new Date().toISOString(),
      dueDate: dueDate ? parseDueDate(dueDate) || dueDate : undefined,
      category: category?.toLowerCase().replace("#", ""),
      parentId,
      priority: (priority as Task["priority"]) || undefined,
    };
    
    currentTasks.push(newTask);
    this.setState({ ...this.state, tasks: currentTasks });
    
    let response = `✅ Task "${title}" added!`;
    if (newTask.dueDate) response += ` ${formatDueDate(newTask.dueDate)}`;
    if (newTask.category) response += ` #${newTask.category}`;
    if (newTask.parentId) {
      const parent = currentTasks.find(t => t.id === newTask.parentId);
      response += ` (subtask of "${parent?.title}")`;
    }
    return response;
  }

  private completeTask(identifier: string): string {
    const currentTasks = [...(this.state?.tasks ?? [])];
    const idx = currentTasks.findIndex(
      (t) =>
        t.id === identifier ||
        t.title.toLowerCase().includes(identifier.toLowerCase())
    );
    if (idx === -1) {
      return `No task found matching "${identifier}".`;
    }
    currentTasks[idx] = { ...currentTasks[idx], completed: true };
    this.setState({ ...this.state, tasks: currentTasks });
    return `✅ Task "${currentTasks[idx].title}" marked as completed!`;
  }

  private removeTask(identifier: string): string {
    const currentTasks = [...(this.state?.tasks ?? [])];
    const idx = currentTasks.findIndex(
      (t) =>
        t.id === identifier ||
        t.title.toLowerCase().includes(identifier.toLowerCase())
    );
    if (idx === -1) {
      return `No task found matching "${identifier}".`;
    }
    const removed = currentTasks[idx];
    
    // Also remove subtasks
    const toRemove = new Set([removed.id]);
    currentTasks.forEach(t => {
      if (t.parentId === removed.id) toRemove.add(t.id);
    });
    
    const filtered = currentTasks.filter(t => !toRemove.has(t.id));
    this.setState({ ...this.state, tasks: filtered });
    
    const subtaskCount = toRemove.size - 1;
    let response = `✅ Task "${removed.title}" removed!`;
    if (subtaskCount > 0) response += ` (and ${subtaskCount} subtask${subtaskCount > 1 ? 's' : ''})`;
    return response;
  }

  private listTasks(category?: string): string {
    const allTasks = this.state?.tasks ?? [];
    
    // Filter by category if provided
    let tasks = category 
      ? allTasks.filter(t => t.category === category.toLowerCase().replace("#", ""))
      : allTasks;
    
    // Separate parent tasks and subtasks
    const parentTasks = tasks.filter(t => !t.parentId);
    
    if (parentTasks.length === 0) {
      return category 
        ? `📋 No tasks found with category #${category}.`
        : "📋 You have no tasks yet. Try adding one!";
    }
    
    const lines: string[] = [];
    parentTasks.forEach((t, i) => {
      let line = `${i + 1}. ${t.completed ? "✅" : "⏳"} ${t.title}`;
      if (t.dueDate) line += ` ${formatDueDate(t.dueDate)}`;
      if (t.category) line += ` #${t.category}`;
      if (t.priority) line += ` [${t.priority}]`;
      lines.push(line);
      
      // Add subtasks indented
      const subtasks = tasks.filter(st => st.parentId === t.id);
      subtasks.forEach(st => {
        let subLine = `   └─ ${st.completed ? "✅" : "⏳"} ${st.title}`;
        if (st.dueDate) subLine += ` ${formatDueDate(st.dueDate)}`;
        lines.push(subLine);
      });
    });
    
    const header = category ? `📋 Tasks with #${category}:` : "📋 Your tasks:";
    return `${header}\n${lines.join("\n")}`;
  }

  private getDailySummary(): string {
    const tasks = this.state?.tasks ?? [];
    const today = new Date().toISOString().split("T")[0];
    
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const overdue = tasks.filter(t => t.dueDate && t.dueDate < today && !t.completed).length;
    const dueToday = tasks.filter(t => t.dueDate === today && !t.completed).length;
    const dueSoon = tasks.filter(t => {
      if (!t.dueDate || t.completed) return false;
      const dueDate = new Date(t.dueDate);
      const todayDate = new Date(today);
      const diffDays = Math.ceil((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= 3;
    }).length;
    
    // Get categories
    const categories = [...new Set(tasks.filter(t => t.category).map(t => t.category))];
    
    let summary = `📊 **Daily Summary**\n\n`;
    summary += `📝 Total tasks: ${total}\n`;
    summary += `✅ Completed: ${completed}\n`;
    summary += `⏳ Pending: ${pending}\n`;
    
    if (overdue > 0) summary += `⚠️ Overdue: ${overdue}\n`;
    if (dueToday > 0) summary += `🔥 Due today: ${dueToday}\n`;
    if (dueSoon > 0) summary += `📅 Due in next 3 days: ${dueSoon}\n`;
    
    if (categories.length > 0) {
      summary += `\n🏷️ Categories: ${categories.map(c => `#${c}`).join(", ")}`;
    }
    
    // Suggest what to focus on
    if (overdue > 0) {
      const overdueTask = tasks.find(t => t.dueDate && t.dueDate < today && !t.completed);
      summary += `\n\n💡 **Focus suggestion:** Start with overdue task "${overdueTask?.title}"`;
    } else if (dueToday > 0) {
      const todayTask = tasks.find(t => t.dueDate === today && !t.completed);
      summary += `\n\n💡 **Focus suggestion:** Complete "${todayTask?.title}" - it's due today!`;
    } else if (pending > 0) {
      const highPriority = tasks.find(t => t.priority === "high" && !t.completed);
      if (highPriority) {
        summary += `\n\n💡 **Focus suggestion:** Work on high-priority task "${highPriority.title}"`;
      }
    }
    
    return summary;
  }

  private getSmartSuggestions(context: string): string {
    const tasks = this.state?.tasks ?? [];
    const pendingTasks = tasks.filter(t => !t.completed && !t.parentId);
    
    if (pendingTasks.length === 0) {
      return "🎉 You have no pending tasks! Time to relax or add new goals.";
    }
    
    const lowerContext = context.toLowerCase();
    let suggestions: string[] = [];
    
    // Time-based suggestions
    if (lowerContext.includes("15 min") || lowerContext.includes("quick") || lowerContext.includes("short")) {
      suggestions.push("⚡ **Quick wins** (can be done fast):");
      const quickTasks = pendingTasks.filter(t => 
        t.title.length < 30 || 
        t.title.toLowerCase().includes("buy") ||
        t.title.toLowerCase().includes("call") ||
        t.title.toLowerCase().includes("email")
      ).slice(0, 3);
      quickTasks.forEach(t => suggestions.push(`   • ${t.title}`));
      if (quickTasks.length === 0) suggestions.push("   • No obvious quick tasks found");
    }
    
    // Mood-based suggestions
    else if (lowerContext.includes("productive") || lowerContext.includes("motivated") || lowerContext.includes("energy")) {
      suggestions.push("🚀 **High-impact tasks** for your productive mood:");
      const impactTasks = pendingTasks.filter(t => 
        t.priority === "high" || 
        t.dueDate ||
        t.title.toLowerCase().includes("important")
      ).slice(0, 3);
      if (impactTasks.length > 0) {
        impactTasks.forEach(t => suggestions.push(`   • ${t.title}`));
      } else {
        pendingTasks.slice(0, 3).forEach(t => suggestions.push(`   • ${t.title}`));
      }
    }
    
    // Tired/low energy
    else if (lowerContext.includes("tired") || lowerContext.includes("low energy") || lowerContext.includes("easy")) {
      suggestions.push("😌 **Easy tasks** for when energy is low:");
      const easyTasks = pendingTasks.filter(t => 
        t.priority === "low" ||
        t.title.toLowerCase().includes("organize") ||
        t.title.toLowerCase().includes("review")
      ).slice(0, 3);
      if (easyTasks.length > 0) {
        easyTasks.forEach(t => suggestions.push(`   • ${t.title}`));
      } else {
        suggestions.push("   • Consider breaking a larger task into smaller steps");
      }
    }
    
    // Category-based
    else if (lowerContext.includes("shopping") || lowerContext.includes("errands")) {
      suggestions.push("🛒 **Shopping/Errand tasks:**");
      const shoppingTasks = pendingTasks.filter(t => 
        t.category === "shopping" ||
        t.title.toLowerCase().includes("buy") ||
        t.title.toLowerCase().includes("get")
      ).slice(0, 5);
      if (shoppingTasks.length > 0) {
        shoppingTasks.forEach(t => suggestions.push(`   • ${t.title}`));
      } else {
        suggestions.push("   • No shopping tasks found");
      }
    }
    
    // Work-related
    else if (lowerContext.includes("work") || lowerContext.includes("office")) {
      suggestions.push("💼 **Work-related tasks:**");
      const workTasks = pendingTasks.filter(t => 
        t.category === "work" ||
        t.title.toLowerCase().includes("meeting") ||
        t.title.toLowerCase().includes("report") ||
        t.title.toLowerCase().includes("email")
      ).slice(0, 5);
      if (workTasks.length > 0) {
        workTasks.forEach(t => suggestions.push(`   • ${t.title}`));
      } else {
        suggestions.push("   • No work tasks found");
      }
    }
    
    // Default - priority based
    else {
      suggestions.push("📋 **Suggested task order:**");
      
      // Overdue first
      const today = new Date().toISOString().split("T")[0];
      const overdue = pendingTasks.filter(t => t.dueDate && t.dueDate < today);
      const dueToday = pendingTasks.filter(t => t.dueDate === today);
      const highPriority = pendingTasks.filter(t => t.priority === "high" && !overdue.includes(t) && !dueToday.includes(t));
      const others = pendingTasks.filter(t => !overdue.includes(t) && !dueToday.includes(t) && !highPriority.includes(t));
      
      if (overdue.length > 0) {
        suggestions.push("\n⚠️ Overdue:");
        overdue.slice(0, 2).forEach(t => suggestions.push(`   • ${t.title}`));
      }
      if (dueToday.length > 0) {
        suggestions.push("\n🔥 Due today:");
        dueToday.slice(0, 2).forEach(t => suggestions.push(`   • ${t.title}`));
      }
      if (highPriority.length > 0) {
        suggestions.push("\n🎯 High priority:");
        highPriority.slice(0, 2).forEach(t => suggestions.push(`   • ${t.title}`));
      }
      if (others.length > 0 && suggestions.length < 8) {
        suggestions.push("\n📝 Other tasks:");
        others.slice(0, 2).forEach(t => suggestions.push(`   • ${t.title}`));
      }
    }
    
    return suggestions.join("\n");
  }

  private setTaskPriority(identifier: string, priority: string): string {
    const currentTasks = [...(this.state?.tasks ?? [])];
    const idx = currentTasks.findIndex(
      (t) =>
        t.id === identifier ||
        t.title.toLowerCase().includes(identifier.toLowerCase())
    );
    if (idx === -1) {
      return `No task found matching "${identifier}".`;
    }
    
    const validPriorities = ["high", "medium", "low"];
    if (!validPriorities.includes(priority.toLowerCase())) {
      return `Invalid priority. Use: high, medium, or low.`;
    }
    
    currentTasks[idx] = { ...currentTasks[idx], priority: priority.toLowerCase() as Task["priority"] };
    this.setState({ ...this.state, tasks: currentTasks });
    return `✅ Task "${currentTasks[idx].title}" set to ${priority} priority!`;
  }

  private clearAllTasks(): string {
    this.setState({ ...this.state, tasks: [] });
    return "🗑️ All tasks have been cleared!";
  }

  // ── Parse and execute tool calls from model text ───────────────────────────
  
  private parseAndExecuteTools(text: string): { toolResult: string | null; cleanedText: string } {
    // Match patterns like [addTask(title="buy groceries", dueDate="friday", category="shopping")]
    const toolPattern = /\[(\w+)\(([^\]]*)\)\]/g;
    let match;
    let toolResult: string | null = null;
    let cleanedText = text;

    while ((match = toolPattern.exec(text)) !== null) {
      const [fullMatch, toolName, argsStr] = match;
      
      const args: Record<string, string> = {};
      // Handle both single and double quotes, and values with commas
      const argPattern = /(\w+)=["']([^"']+)["']/g;
      let argMatch;
      while ((argMatch = argPattern.exec(argsStr)) !== null) {
        args[argMatch[1]] = argMatch[2];
      }

      switch (toolName) {
        case "addTask":
          toolResult = this.addTask(
            args.title || "", 
            args.dueDate, 
            args.category, 
            args.parentId,
            args.priority
          );
          break;
        case "completeTask":
          toolResult = this.completeTask(args.identifier || "");
          break;
        case "removeTask":
          toolResult = this.removeTask(args.identifier || "");
          break;
        case "listTasks":
          toolResult = this.listTasks(args.category);
          break;
        case "dailySummary":
          toolResult = this.getDailySummary();
          break;
        case "suggest":
          toolResult = this.getSmartSuggestions(args.context || "");
          break;
        case "setPriority":
          toolResult = this.setTaskPriority(args.identifier || "", args.priority || "medium");
          break;
        case "clearAll":
          toolResult = this.clearAllTasks();
          break;
      }

      cleanedText = cleanedText.replace(fullMatch, "").trim();
    }

    return { toolResult, cleanedText };
  }

  // Handle HTTP requests to the agent
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle chat API endpoint
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json() as ChatRequest;
        const userMessage = body.message;

        if (!userMessage) {
          return Response.json({ error: "Message is required" }, { status: 400 });
        }

        const workersai = createWorkersAI({ binding: this.env.AI });

        const tasks = this.state?.tasks ?? [];
        const parentTasks = tasks.filter(t => !t.parentId);
        const taskLines = parentTasks.map((t, i) => {
          let line = `${i + 1}. [${t.completed ? "✓" : " "}] ${t.title}`;
          if (t.dueDate) line += ` (due: ${t.dueDate})`;
          if (t.category) line += ` #${t.category}`;
          if (t.priority) line += ` [${t.priority}]`;
          
          // Add subtasks
          const subtasks = tasks.filter(st => st.parentId === t.id);
          if (subtasks.length > 0) {
            subtasks.forEach(st => {
              line += `\n   └─ [${st.completed ? "✓" : " "}] ${st.title}`;
            });
          }
          return line;
        });
        
        const taskSummary = tasks.length === 0
          ? "The user has no tasks yet."
          : `Current tasks:\n${taskLines.join("\n")}`;

        const result = await generateText({
          model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
          system: `You are a helpful AI task manager assistant with advanced features.

${taskSummary}

AVAILABLE ACTIONS (use EXACT syntax - only when user EXPLICITLY requests):

1. ADD TASK with optional due date, category, priority, or as subtask:
   [addTask(title="task name")]
   [addTask(title="task name", dueDate="friday")]
   [addTask(title="task name", category="shopping")]
   [addTask(title="task name", priority="high")]
   [addTask(title="subtask name", parentId="parent task name")]
   
2. COMPLETE a task:
   [completeTask(identifier="task name or part of it")]
   
3. REMOVE a task:
   [removeTask(identifier="task name")]
   
4. LIST tasks (optionally by category):
   [listTasks()]
   [listTasks(category="shopping")]
   
5. DAILY SUMMARY - overview of all tasks:
   [dailySummary()]
   
6. SMART SUGGESTIONS based on context:
   [suggest(context="I have 15 minutes")]
   [suggest(context="feeling productive")]
   [suggest(context="shopping trip")]
   
7. SET PRIORITY:
   [setPriority(identifier="task name", priority="high")]
   
8. CLEAR ALL tasks:
   [clearAll()]

RULES:
1. ONLY use actions when user EXPLICITLY asks to manage tasks
2. Keywords that indicate actions: "add", "create", "new task", "remove", "delete", "complete", "done", "mark", "list", "show", "summary", "suggest", "priority", "clear all"
3. For conversation, advice, or questions - respond naturally WITHOUT brackets
4. Due dates can be: "today", "tomorrow", "friday", "next week", "in 3 days"
5. Categories are single words: shopping, work, personal, health, etc.
6. Priorities: high, medium, low

EXAMPLES:
User: "add task buy milk for tomorrow #shopping"
You: [addTask(title="buy milk", dueDate="tomorrow", category="shopping")]

User: "add subtask buy eggs under groceries"
You: [addTask(title="buy eggs", parentId="groceries")]

User: "give me a daily summary"
You: [dailySummary()]

User: "I have 15 minutes, what should I do?"
You: [suggest(context="15 minutes quick tasks")]

User: "set buy milk as high priority"
You: [setPriority(identifier="buy milk", priority="high")]

User: "show my shopping tasks"
You: [listTasks(category="shopping")]

User: "what's the best way to organize tasks?"
You: (Give advice naturally, no action brackets)

User: "clear all my tasks"
You: [clearAll()]`,

          prompt: userMessage,
        });

        console.log("LLM Response:", result.text);

        // Parse and execute any tool calls
        const { toolResult, cleanedText } = this.parseAndExecuteTools(result.text);

        // Build final response
        let response = "";
        if (toolResult) {
          response = toolResult;
        } else {
          response = result.text;
        }

        return Response.json({ response });
      } catch (error) {
        console.error("Chat error:", error);
        return Response.json({ error: "Failed to process message" }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  }
}

// ── Worker entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Route /api/chat to the agent
    if (url.pathname === "/api/chat") {
      const id = env.TaskManagerAgent.idFromName("default");
      const agent = env.TaskManagerAgent.get(id);
      return agent.fetch(request);
    }
    
    // Route other agent requests (WebSocket connections for state sync)
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
