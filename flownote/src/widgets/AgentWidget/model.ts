import type { TaskProps } from "../../entities/task";

export type NoteBlock = {
    content?: Array<{
        text?: string;
    }>;
};

export type KnowledgeNote = {
    id: string;
    title: string;
    content?: NoteBlock[];
    created_at?: string | Date;
};

export type WorkspaceSnapshot = {
    notes: KnowledgeNote[];
    tasks: TaskProps[];
};

export type AgentProfile = {
    id: string;
    name: string;
    role: string;
    description: string;
    systemPrompt: string;
};

export const agentProfiles: AgentProfile[] = [
    {
        id: "planner",
        name: "플래너 에이전트",
        role: "기본",
        description: "노트와 작업을 연결해 실행 순서와 다음 행동을 정리합니다.",
        systemPrompt: "사용자의 노트와 작업을 기반으로 우선순위, 체크리스트, 다음 행동을 짧고 실행 가능하게 정리하세요.",
    },
    {
        id: "knowledge",
        name: "지식 정리 에이전트",
        role: "노트",
        description: "비어있는 주제, 연결 후보, 요약 방향을 찾습니다.",
        systemPrompt: "최근 노트의 주제 연결, 빈 지식 영역, 다음 작성 후보를 중심으로 답변하세요.",
    },
    {
        id: "coach",
        name: "실행 코치 에이전트",
        role: "집중",
        description: "진행 중인 작업을 작게 쪼개고 오늘 할 일을 정합니다.",
        systemPrompt: "진행 중인 작업을 기준으로 지금 바로 시작할 수 있는 작은 단계와 시간 계획을 제안하세요.",
    },
];

export const statusLabel: Record<TaskProps["status"], string> = {
    TODO: "할 일",
    DOING: "진행 중",
    DONE: "완료",
};

export const getNotePreview = (note: KnowledgeNote) => {
    const firstText = note.content?.flatMap((block) => block.content ?? []).find((item) => item.text?.trim())?.text;
    return firstText?.trim() || "아직 요약할 본문이 없습니다.";
};

export const formatDueDate = (value?: string) => {
    if (!value) return "기한 없음";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("ko-KR", {
        month: "short",
        day: "numeric",
    }).format(date);
};

const clipText = (value: string, maxLength: number) => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength).trim()}...`;
};

export const sanitizeInternalApiMentions = (value: string) => (
    value.replace(/\b(?:spring|spting)\s*api\b/gi, "서버")
);

export const buildAgentPrompt = (
    userText: string,
    snapshot: WorkspaceSnapshot,
    agent: AgentProfile = agentProfiles[0],
    customInstruction = "",
) => {
    const noteContext = snapshot.notes.slice(0, 8).map((note, index) => (
        `${index + 1}. ${note.title}: ${clipText(getNotePreview(note), 180)}`
    ));
    const taskContext = snapshot.tasks
        .filter((task) => task.status !== "DONE")
        .slice(0, 8)
        .map((task, index) => (
            `${index + 1}. ${task.task_name || "이름 없는 작업"} ` +
            `[${statusLabel[task.status]} / ${formatDueDate(task.due_date)} / ${task.estimated_minutes}분]` +
            `${task.category ? ` category=${task.category}` : ""}` +
            `${task.tags?.length ? ` tags=${task.tags.join(", ")}` : ""}`
        ));

    return [
        "당신은 Flownote의 지식관리 에이전트입니다.",
        `[현재 에이전트] ${agent.name} - ${agent.description}`,
        `[에이전트 기본 기능] ${agent.systemPrompt}`,
        customInstruction.trim() ? `[사용자 기능 조작 프롬프트] ${customInstruction.trim()}` : "",
        "사용자 질문에 답하되, 아래 워크스페이스 컨텍스트를 우선 참고해 노트, 작업, 다음 행동을 연결하세요.",
        "컨텍스트에 없는 내용은 추측하지 말고 필요한 확인 질문을 짧게 제시하세요.",
        "내부 서버 구현명, 특정 백엔드 프레임워크명, 내부 API 이름은 답변에 노출하지 마세요.",
        "",
        "[사용자 질문]",
        userText,
        "",
        "[최근 노트]",
        noteContext.length > 0 ? noteContext.join("\n") : "노트 없음",
        "",
        "[진행 작업]",
        taskContext.length > 0 ? taskContext.join("\n") : "진행 작업 없음",
    ].join("\n");
};
