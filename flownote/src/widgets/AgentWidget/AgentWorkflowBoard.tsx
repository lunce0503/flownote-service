import { Archive, ClipboardList, FilePenLine, ListChecks, Send, Sparkles } from "lucide-react";
import { useState } from "react";

type WorkflowStage = {
    id: string;
    title: string;
    description: string;
    icon: typeof ClipboardList;
    prompt: string;
};

type AgentWorkflowBoardProps = {
    isLoading: boolean;
    onRunPrompt: (prompt: string) => void | Promise<void>;
};

const workflowStages: WorkflowStage[] = [
    {
        id: "plan",
        title: "계획",
        description: "안건, 우선순위, 실행 순서를 잡습니다.",
        icon: ClipboardList,
        prompt: "현재 노트와 작업을 기준으로 오늘 처리할 안건을 계획, 작성, 점검, 정리 순서로 나눠줘. 각 단계마다 첫 행동과 예상 시간을 붙여줘.",
    },
    {
        id: "write",
        title: "작성",
        description: "초안, 노트, 작업 단위를 만듭니다.",
        icon: FilePenLine,
        prompt: "진행 중인 작업과 최근 노트를 보고 지금 작성해야 할 초안, 노트 제목, 작업 항목을 제안해줘. 바로 붙여넣어 쓸 수 있게 구성해줘.",
    },
    {
        id: "review",
        title: "점검",
        description: "누락, 위험, 검증 항목을 확인합니다.",
        icon: ListChecks,
        prompt: "현재 워크스페이스에서 누락된 점검 항목, 위험한 가정, 검증해야 할 내용을 찾아줘. 우선순위 높은 항목부터 체크리스트로 정리해줘.",
    },
    {
        id: "organize",
        title: "정리",
        description: "완료 기록과 다음 행동으로 묶습니다.",
        icon: Archive,
        prompt: "최근 노트와 작업을 정리해서 완료 기록, 남은 작업, 다음 행동, 보관할 지식으로 나눠줘. 불필요하게 반복되는 항목도 알려줘.",
    },
];

const buildImprovementPrompt = (request: string) => [
    "다음 개선 요청을 Flownote 워크스페이스에 적용할 실행 안건으로 바꿔줘.",
    "반드시 계획, 작성, 점검, 정리 단계로 나누고 각 단계마다 수정 대상, 확인 방법, 다음 행동을 제시해줘.",
    "",
    "[개선 요청]",
    request,
].join("\n");

const AgentWorkflowBoard = ({ isLoading, onRunPrompt }: AgentWorkflowBoardProps) => {
    const [improvementPrompt, setImprovementPrompt] = useState("");

    const handleRunStage = (prompt: string) => {
        if (isLoading) return;
        void onRunPrompt(prompt);
    };

    const handleSubmitImprovement = () => {
        const request = improvementPrompt.trim();
        if (!request || isLoading) return;

        setImprovementPrompt("");
        void onRunPrompt(buildImprovementPrompt(request));
    };

    return (
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Sparkles size={17} />
                작업 흐름
            </h2>

            <div className="grid gap-2">
                {workflowStages.map((stage) => {
                    const Icon = stage.icon;

                    return (
                        <button
                            key={stage.id}
                            type="button"
                            className="group rounded-md border border-stone-200 bg-stone-50 p-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleRunStage(stage.prompt)}
                            disabled={isLoading}
                        >
                            <span className="flex items-center gap-2 text-sm font-bold text-stone-900">
                                <Icon size={16} className="text-amber-700" />
                                {stage.title}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-stone-600">{stage.description}</span>
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-3">
                <label className="block text-xs font-bold text-stone-700" htmlFor="agent-improvement-prompt">
                    개선 프롬프트
                </label>
                <textarea
                    id="agent-improvement-prompt"
                    className="mt-2 min-h-20 w-full resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-amber-400"
                    value={improvementPrompt}
                    onChange={(event) => setImprovementPrompt(event.target.value)}
                    placeholder="예: 일정 점검 흐름을 더 빠르게 만들고 싶어"
                    disabled={isLoading}
                />
                <button
                    type="button"
                    className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-stone-900 px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
                    onClick={handleSubmitImprovement}
                    disabled={isLoading || !improvementPrompt.trim()}
                >
                    <Send size={15} />
                    안건으로 적용
                </button>
            </div>
        </section>
    );
};

export default AgentWorkflowBoard;
