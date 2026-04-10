import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * ChatPanel — Jarvis conversational AI interface.
 * Can render as a slide-out panel (isOverlay=true) or inline (full-page /chat).
 */
export default function ChatPanel({ isOverlay = false, isOpen = true, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const historyLoadedRef = useRef(false);
  const pendingGreetRef = useRef(false);
  const lastSentTextRef = useRef(null);

  const getToken = useCallback(async () => {
    let { data: sessionData } = await supabase.auth.getSession();
    let token = sessionData?.session?.access_token;
    if (!token) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = refreshed?.session?.access_token;
    }
    return token;
  }, []);

  // Load conversation history on mount
  useEffect(() => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;

    async function loadHistory() {
      try {
        const token = await getToken();
        if (!token) { setIsLoadingHistory(false); return; }

        const res = await fetch("/api/chat/history?limit=100", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setIsLoadingHistory(false); return; }

        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          // Convert DB messages to display format
          const displayMsgs = [];
          for (const msg of data.messages) {
            if (msg.role === "user") {
              displayMsgs.push({ role: "user", content: msg.content });
            } else if (msg.role === "assistant") {
              displayMsgs.push({ role: "assistant", content: msg.content || "", toolCalls: [] });
            } else if (msg.role === "tool_call") {
              // Attach tool calls to the previous assistant message
              const lastAssistant = displayMsgs.findLast((m) => m.role === "assistant");
              if (lastAssistant && msg.tool_calls) {
                lastAssistant.toolCalls = msg.tool_calls.map((tc) => ({
                  name: tc.name,
                  status: "done",
                }));
              }
            }
            // Skip tool_result messages in display
          }
          setMessages(displayMsgs);
          shouldAutoGreet = false;
        }
      } catch {
        // Silently fail — empty chat is fine
      } finally {
        setIsLoadingHistory(false);
        // Auto-greeting: if no history, trigger Jarvis with nudge check
        if (shouldAutoGreet) {
          pendingGreetRef.current = true;
        }
      }
    }

    let shouldAutoGreet = true;
    loadHistory();
  }, [getToken]);

  // Auto-scroll to bottom on new messages, history load, or panel open
  useEffect(() => {
    if (scrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages, isOpen, isLoadingHistory]);

  // Auto-greeting pickup: after history loads, if no messages found, greet
  useEffect(() => {
    if (!isLoadingHistory && pendingGreetRef.current && !isStreaming) {
      pendingGreetRef.current = false;
      // Delay to ensure sendText is ready
      const timer = setTimeout(() => sendText("[auto-greeting]", { hidden: true }), 200);
      return () => clearTimeout(timer);
    }
  }); // intentionally no deps — runs every render until it fires once

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape for overlay mode
  useEffect(() => {
    if (!isOverlay || !isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOverlay, isOpen, onClose]);

  const sendText = useCallback(async (text, { hidden = false } = {}) => {
    if (!text || isStreaming) return;
    setError(null);
    lastSentTextRef.current = hidden ? null : text;

    if (!hidden) {
      const userMsg = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
    }
    setIsStreaming(true);

    // Create a placeholder for the assistant response
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", toolCalls: [] },
    ]);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          let event;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "text") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: (last.content || "") + event.content,
                };
              }
              return updated;
            });
          }

          if (event.type === "tool_call_start") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  toolCalls: [
                    ...(last.toolCalls || []),
                    { name: event.name, status: "running" },
                  ],
                };
              }
              return updated;
            });
          }

          if (event.type === "tool_result") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                const tcs = [...(last.toolCalls || [])];
                const idx = tcs.findIndex(
                  (tc) => tc.name === event.name && tc.status === "running"
                );
                if (idx >= 0) {
                  tcs[idx] = { ...tcs[idx], status: "done", result: event.result };
                }
                updated[updated.length - 1] = { ...last, toolCalls: tcs };
              }
              return updated;
            });
          }

          if (event.type === "error") {
            setError(event.message || "Something went wrong. Please try again.");
            // Remove empty assistant placeholder on error
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && !last.content && (!last.toolCalls || last.toolCalls.length === 0)) {
                return prev.slice(0, -1);
              }
              return prev;
            });
          }

          if (event.type === "done") {
            // Clean exit — streaming will be set to false in finally
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Connection lost. Please try again.");
        // Remove empty assistant placeholder on error
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content && (!last.toolCalls || last.toolCalls.length === 0)) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, getToken]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendText(text);
  }, [input, sendText]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isOverlay && !isOpen) return null;

  const panelClass = isOverlay ? "jarvis-panel jarvis-panel--overlay" : "jarvis-panel jarvis-panel--inline";

  return (
    <>
      {isOverlay && (
        <div className="jarvis-scrim" onClick={onClose} />
      )}
      <div className={panelClass}>
        {/* Header */}
        <div className="jarvis-header">
          <div className="jarvis-header__title">
            <span className="material-symbols-outlined" aria-hidden>smart_toy</span>
            <span>Jarvis</span>
          </div>
          {isOverlay && (
            <button
              type="button"
              className="jarvis-header__close"
              onClick={onClose}
              aria-label="Close chat"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="jarvis-messages" ref={scrollRef}>
          {isLoadingHistory && messages.length === 0 && (
            <div className="jarvis-empty">
              <div className="jarvis-typing">
                <span className="jarvis-typing__dot" />
                <span className="jarvis-typing__dot" />
                <span className="jarvis-typing__dot" />
              </div>
            </div>
          )}
          {!isLoadingHistory && messages.length === 0 && (
            <div className="jarvis-empty">
              <span className="material-symbols-outlined jarvis-empty__icon">chat</span>
              <p>Hey! I'm Jarvis, your Rise &amp; Shine coach.</p>
              <p>Ask me about your tasks, goals, or just tell me what's on your mind.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {isStreaming && (
            <div className="jarvis-typing">
              <span className="jarvis-typing__dot" />
              <span className="jarvis-typing__dot" />
              <span className="jarvis-typing__dot" />
            </div>
          )}
          {error && (
            <div className="jarvis-error">
              <span className="material-symbols-outlined">error</span>
              <span style={{ flex: 1 }}>{error}</span>
              {lastSentTextRef.current && !isStreaming && (
                <button
                  type="button"
                  className="jarvis-error__retry"
                  onClick={() => {
                    const retryText = lastSentTextRef.current;
                    setError(null);
                    if (retryText) sendText(retryText);
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="jarvis-input-area">
          <textarea
            ref={inputRef}
            className="jarvis-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Jarvis..."
            rows={1}
            disabled={isStreaming}
          />
          <button
            type="button"
            className="jarvis-send"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
          >
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ message }) {
  const { role, content, toolCalls } = message;
  const [expandedTools, setExpandedTools] = useState({});

  const toggleTool = (idx) => {
    setExpandedTools((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (role === "user") {
    return (
      <div className="jarvis-msg jarvis-msg--user">
        <div className="jarvis-msg__bubble jarvis-msg__bubble--user">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="jarvis-msg jarvis-msg--assistant">
      {/* Tool call indicators */}
      {toolCalls && toolCalls.length > 0 && (
        <div className="jarvis-tools">
          {toolCalls.map((tc, idx) => (
            <div key={idx} className="jarvis-tool">
              <button
                type="button"
                className="jarvis-tool__header"
                onClick={() => toggleTool(idx)}
              >
                <span className="material-symbols-outlined jarvis-tool__icon">
                  {tc.status === "running" ? "hourglass_top" : "check_circle"}
                </span>
                <span className="jarvis-tool__name">
                  {formatToolName(tc.name)}
                </span>
                <span className="material-symbols-outlined jarvis-tool__chevron">
                  {expandedTools[idx] ? "expand_less" : "expand_more"}
                </span>
              </button>
              {expandedTools[idx] && tc.result && (
                <pre className="jarvis-tool__result">
                  {JSON.stringify(tc.result, null, 2).slice(0, 2000)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Text content */}
      {content && (
        <div className="jarvis-msg__bubble jarvis-msg__bubble--assistant">
          <AssistantContent text={content} />
        </div>
      )}
    </div>
  );
}

function AssistantContent({ text }) {
  // Simple markdown-like rendering: bold, bullet points, line breaks
  if (!text) return null;

  const lines = text.split("\n");
  return (
    <div className="jarvis-content">
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />;

        // Bold: **text**
        const parts = [];
        let remaining = line;
        let partIdx = 0;
        while (remaining.includes("**")) {
          const start = remaining.indexOf("**");
          if (start > 0) parts.push(<span key={partIdx++}>{remaining.slice(0, start)}</span>);
          remaining = remaining.slice(start + 2);
          const end = remaining.indexOf("**");
          if (end < 0) {
            parts.push(<span key={partIdx++}>**{remaining}</span>);
            remaining = "";
            break;
          }
          parts.push(<strong key={partIdx++}>{remaining.slice(0, end)}</strong>);
          remaining = remaining.slice(end + 2);
        }
        if (remaining) parts.push(<span key={partIdx++}>{remaining}</span>);

        // Bullet points
        const trimmed = line.trimStart();
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={i} className="jarvis-bullet">
              <span className="jarvis-bullet__dot" />
              <span>{parts}</span>
            </div>
          );
        }

        // Numbered lists
        if (/^\d+\.\s/.test(trimmed)) {
          return (
            <div key={i} className="jarvis-bullet">
              <span className="jarvis-bullet__num">{trimmed.match(/^\d+/)[0]}.</span>
              <span>{parts.length > 0 ? parts : trimmed.replace(/^\d+\.\s/, "")}</span>
            </div>
          );
        }

        return <p key={i} style={{ margin: "0.25em 0" }}>{parts.length > 0 ? parts : line}</p>;
      })}
    </div>
  );
}

function formatToolName(name) {
  return name
    .replace(/^get_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
