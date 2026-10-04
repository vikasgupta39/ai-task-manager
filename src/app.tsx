import { useAgent } from "agents/react";
import { useRef, useEffect, useState, useCallback } from "react";
import "./styles.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  dueDate?: string;
  category?: string;
  parentId?: string;
  priority?: "high" | "medium" | "low";
}

interface AgentState {
  tasks: Task[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function formatDueDate(dateStr: string): { text: string; className: string } {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return { text: `Overdue`, className: "due-overdue" };
  if (diffDays === 0) return { text: "Today", className: "due-today" };
  if (diffDays === 1) return { text: "Tomorrow", className: "due-soon" };
  if (diffDays <= 3) return { text: `${diffDays}d`, className: "due-soon" };
  return { text: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), className: "due-later" };
}

// ── Task Sidebar ─────────────────────────────────────────────────────────────

function TaskSidebar({ tasks, onCompleteTask, onRemoveTask }: { 
  tasks: Task[]; 
  onCompleteTask: (id: string) => void;
  onRemoveTask: (id: string) => void;
}) {
  const completed = tasks.filter((t) => t.completed).length;
  const pending = tasks.length - completed;
  
  // Get unique categories
  const categories = [...new Set(tasks.filter(t => t.category).map(t => t.category))];
  
  // Separate parent and sub tasks
  const parentTasks = tasks.filter(t => !t.parentId);
  
  // Count overdue
  const today = new Date().toISOString().split("T")[0];
  const overdue = tasks.filter(t => t.dueDate && t.dueDate < today && !t.completed).length;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>📋 Tasks</h2>
        <div className="task-stats">
          <span className="stat-done">✅ {completed}</span>
          <span className="stat-pending">⏳ {pending}</span>
          {overdue > 0 && <span className="stat-overdue">⚠️ {overdue}</span>}
        </div>
      </div>
      
      {categories.length > 0 && (
        <div className="categories">
          {categories.map(cat => (
            <span key={cat} className="category-tag">#{cat}</span>
          ))}
        </div>
      )}
      
      <div className="task-list">
        {parentTasks.length === 0 ? (
          <div className="empty-tasks">
            No tasks yet.<br />
            Try: "add task buy groceries #shopping"
          </div>
        ) : (
          parentTasks.map((task) => {
            const subtasks = tasks.filter(t => t.parentId === task.id);
            return (
              <div key={task.id} className="task-item-container">
                <TaskItem 
                  task={task} 
                  onComplete={() => onCompleteTask(task.id)}
                  onRemove={() => onRemoveTask(task.id)}
                />
                {subtasks.length > 0 && (
                  <div className="subtasks">
                    {subtasks.map(st => (
                      <TaskItem 
                        key={st.id} 
                        task={st} 
                        isSubtask
                        onComplete={() => onCompleteTask(st.id)}
                        onRemove={() => onRemoveTask(st.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function TaskItem({ task, isSubtask = false, onComplete, onRemove }: { 
  task: Task; 
  isSubtask?: boolean;
  onComplete: () => void;
  onRemove: () => void;
}) {
  const dueInfo = task.dueDate ? formatDueDate(task.dueDate) : null;
  
  return (
    <div className={`task-item ${isSubtask ? "subtask" : ""} ${task.completed ? "completed" : ""}`}>
      <button 
        className={`task-checkbox ${task.completed ? "completed" : ""}`}
        onClick={onComplete}
        title={task.completed ? "Already completed" : "Mark as done"}
        disabled={task.completed}
      >
        {task.completed ? "✓" : ""}
      </button>
      <div className="task-content">
        <span className={`task-title ${task.completed ? "completed" : ""}`}>
          {task.title}
        </span>
        <div className="task-meta">
          {task.priority && (
            <span className={`priority priority-${task.priority}`}>
              {task.priority === "high" ? "🔴" : task.priority === "medium" ? "🟡" : "🟢"}
            </span>
          )}
          {dueInfo && (
            <span className={`due-date ${dueInfo.className}`}>
              {dueInfo.text}
            </span>
          )}
          {task.category && (
            <span className="task-category">#{task.category}</span>
          )}
        </div>
      </div>
      <button 
        className="task-remove-btn"
        onClick={onRemove}
        title="Remove task"
      >
        ×
      </button>
    </div>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  // Format message with markdown-like styling
  const formatContent = (content: string) => {
    return content
      .split("\n")
      .map((line, i) => {
        // Bold text
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Category tags
        line = line.replace(/#(\w+)/g, '<span class="msg-tag">#$1</span>');
        return <div key={i} dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }} />;
      });
  };

  return (
    <div className={`message ${message.role}`}>
      <div className="message-role">
        {message.role === "user" ? "You" : "Assistant"}
      </div>
      <div className="message-bubble">
        {formatContent(message.content)}
      </div>
    </div>
  );
}

// ── Welcome Screen ───────────────────────────────────────────────────────────

function Welcome({ onHint }: { onHint: (text: string) => void }) {
  const hints = [
    "Add task buy groceries #shopping",
    "Add task submit report by Friday",
    "Give me a daily summary",
    "I have 15 minutes, what should I do?",
  ];

  return (
    <div className="welcome">
      <div className="welcome-icon">🤖</div>
      <h2>AI Task Manager</h2>
      <p>
        Manage tasks with natural language. Supports due dates, categories, subtasks, and smart suggestions.
      </p>
      <div className="feature-list">
        <div className="feature">📅 Due dates: "by Friday"</div>
        <div className="feature">🏷️ Categories: "#shopping"</div>
        <div className="feature">📊 Subtasks & priorities</div>
        <div className="feature">💡 Smart suggestions</div>
      </div>
      <div className="welcome-hints">
        {hints.map((hint) => (
          <button key={hint} className="hint" onClick={() => onHint(hint)}>
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [inputValue, setInputValue] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Connect to the Durable Object agent via WebSocket for state sync
  const agent = useAgent({
    agent: "TaskManagerAgent",
    onStateUpdate: useCallback((state: AgentState) => {
      console.log("State update:", state);
      setTasks(state?.tasks ?? []);
    }, []),
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response,
        }]);
      } else {
        throw new Error("Failed to get response");
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle task actions from sidebar
  const handleCompleteTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.completed) return;
    
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `complete task ${task.title}` }),
      });
    } catch (error) {
      console.error("Failed to complete task:", error);
    }
  };

  const handleRemoveTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `remove task ${task.title}` }),
      });
    } catch (error) {
      console.error("Failed to remove task:", error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    sendMessage(text);
    setInputValue("");
  };

  const handleHint = (text: string) => {
    sendMessage(text);
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="app-layout">
      <TaskSidebar 
        tasks={tasks} 
        onCompleteTask={handleCompleteTask}
        onRemoveTask={handleRemoveTask}
      />

      <main className="chat-area">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-header-icon">🤖</div>
            <div>
              <h1>AI Task Manager</h1>
              <p>Powered by Cloudflare Workers AI</p>
            </div>
          </div>
          <div className="chat-header-right">
            {messages.length > 0 && (
              <button className="clear-chat-btn" onClick={clearChat} title="Clear chat">
                🗑️ Clear
              </button>
            )}
            <div className={`connection-dot ${!isLoading ? "" : "disconnected"}`} />
          </div>
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <Welcome onHint={handleHint} />
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}

          {isLoading && (
            <div className="streaming-indicator">
              <span />
              <span />
              <span />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <form className="input-form" onSubmit={handleSubmit}>
            <input
              className="input-field"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={!isLoading ? "Try: add task buy milk #shopping by tomorrow" : "Thinking..."}
              disabled={isLoading}
              autoFocus
            />
            <button className="send-button" type="submit" disabled={isLoading || !inputValue.trim()}>
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
