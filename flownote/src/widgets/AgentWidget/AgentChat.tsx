import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "@/shared/ui/ChatBlock";
import { API_AI_BASE_URL, authHeaders } from "@/shared/api";
import { getNoteData } from "@/entities/blog";
import { getTasksData } from "@/features/task";
import { getChatData, postChatData, deleteChatMessage, deleteAllChatMessages } from "@/features/chat";
import AgentConversationPanel from "./AgentConversationPanel";
import AgentFocusQueue from "./AgentFocusQueue";
import AgentInsightsPanel from "./AgentInsightsPanel";
import AgentWorkflowBoard from "./AgentWorkflowBoard";
import AgentWorkspaceSummary from "./AgentWorkspaceSummary";
import { agentProfiles, buildAgentPrompt, buildRecommendedCommands, sanitizeInternalApiMentions, type AgentProfile, type WorkspaceSnapshot } from "./model";

const CUSTOM_AGENTS_STORAGE_KEY = "flownote.customAgents";
const CUSTOM_COMMANDS_STORAGE_KEY = "flownote.customAgentCommands";

const AgentChat = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [workspace, setWorkspace] = useState<WorkspaceSnapshot>({ notes: [], tasks: [] });
    const [customAgents, setCustomAgents] = useState<AgentProfile[]>(() => {
        try {
            const saved = localStorage.getItem(CUSTOM_AGENTS_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [customCommands, setCustomCommands] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(CUSTOM_COMMANDS_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [selectedAgentId, setSelectedAgentId] = useState(agentProfiles[0].id);
    const [customAgentName, setCustomAgentName] = useState("");
    const [customAgentPrompt, setCustomAgentPrompt] = useState("");
    const [customCommand, setCustomCommand] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const agents = [...agentProfiles, ...customAgents];
    const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
    const recommendedCommands = Array.from(new Set([
        ...buildRecommendedCommands(workspace, messages),
        ...customCommands,
    ])).slice(0, 6);

    const activeTasks = workspace.tasks.filter((task) => task.status !== "DONE");
    const completedTasks = workspace.tasks.filter((task) => task.status === "DONE");
    const dueSoonTasks = [...activeTasks]
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
        .slice(0, 4);
    const recentNotes = [...workspace.notes]
        .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
        .slice(0, 5);
    const knowledgeThemes = Array.from(
        new Set(
            workspace.tasks
                .flatMap((task) => [task.category, ...(task.tags ?? [])])
                .filter((value): value is string => Boolean(value?.trim()))
                .map((value) => value.trim()),
        ),
    ).slice(0, 8);

    const scrollToBottom = () => {
        if (!chatContainerRef.current) return;

        chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: "auto",
        });
    };

    const getMessages = async () => {
        try {
            const response = await getChatData();
            const data = Array.isArray(response) ? response : response.messages || [];
            setMessages(data.map((message: ChatMessage) => ({
                ...message,
                message: sanitizeInternalApiMentions(message.message),
            })));
        } catch (err) {
            console.error("Failed to load agent messages:", err);
            setError("대화 기록을 불러오지 못했습니다.");
        }
    };

    const getWorkspace = async () => {
        setIsWorkspaceLoading(true);
        setError(null);

        try {
            const [notes, tasks] = await Promise.all([getNoteData(), getTasksData()]);
            setWorkspace({
                notes: Array.isArray(notes) ? notes : [],
                tasks: Array.isArray(tasks) ? tasks : [],
            });
        } catch (err) {
            console.error("Failed to load agent workspace:", err);
            setError("지식 워크스페이스를 불러오지 못했습니다.");
        } finally {
            setIsWorkspaceLoading(false);
        }
    };

    const askAgent = async (text: string) => {
        try {
            const prompt = buildAgentPrompt(text, workspace, selectedAgent);
            const headers = new Headers({ "Content-Type": "application/json" });
            Object.entries(authHeaders()).forEach(([key, value]) => {
                headers.set(key, value);
            });

            const response = await fetch(`${API_AI_BASE_URL}/api/aiclient/ask_stream`, {
                method: "POST",
                headers,
                body: JSON.stringify({ user_text: prompt }),
            });

            if (!response.body) throw new Error("응답 바디가 없습니다.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let aiResponseText = "";
            const assistantMessageId = uuidv4();

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                const chunk = decoder.decode(value, { stream: true });
                aiResponseText += chunk;
                const visibleResponseText = sanitizeInternalApiMentions(aiResponseText);

                setMessages((prev) => {
                    const existing = prev.find((message) => message.id === assistantMessageId);
                    if (existing) {
                        return prev.map((message) => (
                            message.id === assistantMessageId ? { ...message, message: visibleResponseText } : message
                        ));
                    }

                    return [
                        ...prev,
                        {
                            id: assistantMessageId,
                            sender: "assistant",
                            timestamp: new Date(),
                            message: visibleResponseText,
                        },
                    ];
                });
            }

            const visibleResponseText = sanitizeInternalApiMentions(aiResponseText);
            if (visibleResponseText.trim()) {
                await postChatData({
                    id: assistantMessageId,
                    sender: "assistant",
                    timestamp: new Date(),
                    message: visibleResponseText,
                });
            }
        } catch (err) {
            console.error("fetch error:", err);
            setError("에이전트 응답을 가져오지 못했습니다.");
        } finally {
            void getWorkspace();
            setIsLoading(false);
        }
    };

    const handleSend = async (text: string) => {
        const userMessage: ChatMessage = {
            id: uuidv4(),
            sender: "user",
            timestamp: new Date(),
            message: sanitizeInternalApiMentions(text),
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        try {
            await postChatData(userMessage);
            await askAgent(text);
        } catch (err) {
            console.error("Unexpected Error:", err);
            setIsLoading(false);
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        setMessages((prev) => prev.filter((message) => message.id !== messageId));

        try {
            await deleteChatMessage(messageId);
        } catch (err) {
            console.error("Failed to delete agent message:", err);
            setError("메시지를 삭제하지 못했습니다.");
            void getMessages();
        }
    };

    const handleClearMessages = async () => {
        if (messages.length === 0) return;
        setMessages([]);

        try {
            await deleteAllChatMessages();
        } catch (err) {
            console.error("Failed to clear agent messages:", err);
            setError("대화 기록을 지우지 못했습니다.");
            void getMessages();
        }
    };

    const handleCreateCustomAgent = () => {
        const name = customAgentName.trim();
        const prompt = customAgentPrompt.trim();
        if (!name || !prompt) return;

        const agent: AgentProfile = {
            id: `custom-${uuidv4()}`,
            name,
            role: "커스텀",
            description: prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt,
            systemPrompt: prompt,
        };
        const nextAgents = [...customAgents, agent];
        setCustomAgents(nextAgents);
        localStorage.setItem(CUSTOM_AGENTS_STORAGE_KEY, JSON.stringify(nextAgents));
        setSelectedAgentId(agent.id);
        setCustomAgentName("");
        setCustomAgentPrompt("");
    };

    const handleAddCustomCommand = () => {
        const command = customCommand.trim();
        if (!command) return;

        const nextCommands = Array.from(new Set([command, ...customCommands])).slice(0, 8);
        setCustomCommands(nextCommands);
        localStorage.setItem(CUSTOM_COMMANDS_STORAGE_KEY, JSON.stringify(nextCommands));
        setCustomCommand("");
    };

    useEffect(() => {
        void getMessages();
        void getWorkspace();
        scrollToBottom();
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    return (
        <div className="text-stone-900 lg:h-[calc(100vh-56px)] lg:overflow-hidden">
            <div className="mx-auto grid max-w-7xl gap-4 p-3 md:p-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)_minmax(260px,320px)]">
                <aside className="min-h-0 space-y-4 overflow-y-auto">
                    <AgentWorkspaceSummary
                        workspace={workspace}
                        activeTaskCount={activeTasks.length}
                        completedTaskCount={completedTasks.length}
                        error={error}
                    />
                    <AgentWorkflowBoard
                        isLoading={isLoading}
                        onRunPrompt={handleSend}
                    />
                    <AgentFocusQueue
                        tasks={dueSoonTasks}
                        isLoading={isWorkspaceLoading}
                        onRefresh={() => void getWorkspace()}
                    />
                </aside>

                <AgentConversationPanel
                    messages={messages}
                    isLoading={isLoading}
                    chatContainerRef={chatContainerRef}
                    onSend={handleSend}
                    onDeleteMessage={handleDeleteMessage}
                    onClearMessages={handleClearMessages}
                    agents={agents}
                    selectedAgent={selectedAgent}
                    selectedAgentId={selectedAgentId}
                    onSelectAgent={setSelectedAgentId}
                    recommendedCommands={recommendedCommands}
                    customCommand={customCommand}
                    onCustomCommandChange={setCustomCommand}
                    onAddCustomCommand={handleAddCustomCommand}
                    customAgentName={customAgentName}
                    customAgentPrompt={customAgentPrompt}
                    onCustomAgentNameChange={setCustomAgentName}
                    onCustomAgentPromptChange={setCustomAgentPrompt}
                    onCreateCustomAgent={handleCreateCustomAgent}
                />

                <AgentInsightsPanel
                    activeTasks={activeTasks}
                    recentNotes={recentNotes}
                    knowledgeThemes={knowledgeThemes}
                />
            </div>
        </div>
    );
};

export default AgentChat;
