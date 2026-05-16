import { BrainCircuit, MessageSquareText, Sparkles, Trash2 } from "lucide-react";
import { ChatBlock, ChatSendBlock, type ChatMessage } from "../../shared/ui/ChatBlock";
import { useState, type RefObject } from "react";
import type { AgentProfile } from "./model";

type AgentConversationPanelProps = {
    messages: ChatMessage[];
    isLoading: boolean;
    chatContainerRef: RefObject<HTMLDivElement | null>;
    onSend: (text: string) => void;
    onDeleteMessage: (messageId: string) => void;
    onClearMessages: () => void;
    agents: AgentProfile[];
    selectedAgent: AgentProfile;
    selectedAgentId: string;
    onSelectAgent: (agentId: string) => void;
    agentInstruction: string;
    onAgentInstructionChange: (instruction: string) => void;
};

const prompts = [
    "최근 노트와 작업을 연결해서 오늘 집중할 순서를 정리해줘",
    "내 지식 베이스에서 비어있는 주제와 다음 작성 후보를 찾아줘",
    "진행 중인 작업을 기준으로 실행 가능한 체크리스트를 만들어줘",
];

const AgentConversationPanel = ({
    messages,
    isLoading,
    chatContainerRef,
    onSend,
    onDeleteMessage,
    onClearMessages,
    agents,
    selectedAgent,
    selectedAgentId,
    onSelectAgent,
    agentInstruction,
    onAgentInstructionChange,
}: AgentConversationPanelProps) => {
    const [selectedPrompt, setSelectedPrompt] = useState("");
    const [selectedPromptKey, setSelectedPromptKey] = useState(0);

    const handlePromptSelect = (prompt: string) => {
        setSelectedPrompt(prompt);
        setSelectedPromptKey((key) => key + 1);
    };

    return (
    <main className="flex max-h-[calc(100vh-88px)] min-h-[520px] flex-col overflow-hidden rounded-lg border border-stone-800 bg-stone-100 shadow-xl sm:max-h-[calc(100vh-104px)] lg:min-h-0 lg:self-start">
        <div className="border-b border-stone-200 p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-bold md:text-lg">
                        <MessageSquareText size={20} />
                        에이전트 대화
                    </h2>
                    <p className="hidden text-sm text-stone-500 sm:block">노트와 작업 맥락을 바탕으로 질문하고 다음 행동을 정리합니다.</p>
                </div>
                {isLoading && (
                    <span className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                        <Sparkles size={15} />
                        응답 생성 중
                    </span>
                )}
                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-stone-400"
                    onClick={onClearMessages}
                    disabled={isLoading || messages.length === 0}
                >
                    <Trash2 size={15} />
                    대화 지우기
                </button>
            </div>
            <div className="mt-3 grid gap-3 rounded-lg border border-stone-200 bg-white p-3 md:grid-cols-[minmax(180px,240px)_1fr]">
                <label className="block">
                    <span className="mb-1 block text-xs font-bold text-stone-600">현재 에이전트</span>
                    <select
                        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 outline-none focus:ring-2 focus:ring-blue-400"
                        value={selectedAgentId}
                        onChange={(event) => onSelectAgent(event.target.value)}
                        disabled={isLoading}
                    >
                        {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                                {agent.name}
                            </option>
                        ))}
                    </select>
                    <span className="mt-2 inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                        {selectedAgent.role}
                    </span>
                </label>
                <div>
                    <div className="mb-2 text-sm font-semibold text-stone-900">{selectedAgent.description}</div>
                    <textarea
                        className="h-20 w-full resize-none rounded-md border border-stone-300 p-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="에이전트 기능을 조작할 프롬프트를 입력하세요."
                        value={agentInstruction}
                        onChange={(event) => onAgentInstructionChange(event.target.value)}
                        disabled={isLoading}
                    />
                </div>
            </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-stone-50 p-3 md:p-4" ref={chatContainerRef}>
            {messages.length > 0 ? (
                messages.map((msg) => (
                    <ChatBlock key={msg.id} {...msg} canDelete={!isLoading} onDelete={onDeleteMessage} />
                ))
            ) : (
                <div className="flex h-full min-h-72 items-center justify-center">
                    <div className="max-w-md rounded-lg border border-dashed border-stone-300 bg-white p-5 text-center md:p-6">
                        <BrainCircuit className="mx-auto mb-3 text-amber-700" size={32} />
                        <p className="font-semibold">에이전트와 지식 정리를 시작하세요.</p>
                        <p className="mt-2 hidden text-sm text-stone-500 sm:block">
                            추천 질문을 누르거나 직접 질문을 입력하면 스트리밍 응답으로 정리합니다.
                        </p>
                    </div>
                </div>
            )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-stone-200 bg-stone-100 p-3">
            {prompts.map((prompt) => (
                <button
                    key={prompt}
                    className="rounded-md border border-stone-200 bg-white px-3 py-2 text-left text-xs font-medium text-stone-700 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:text-stone-950 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:translate-y-0 disabled:hover:border-stone-200 disabled:hover:bg-white disabled:hover:shadow-sm"
                    onClick={() => handlePromptSelect(prompt)}
                    disabled={isLoading}
                    type="button"
                >
                    {prompt}
                </button>
            ))}
        </div>

        <ChatSendBlock
            onSend={onSend}
            disabled={isLoading}
            draftText={selectedPrompt}
            draftKey={selectedPromptKey}
        />
    </main>
    );
};

export default AgentConversationPanel;
