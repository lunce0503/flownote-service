import { useEffect, useRef, type ReactNode } from "react";

type ChatSendBlockProps = {
    onSend: (text: string) => void;
    disabled?: boolean;
    draftText?: string;
    draftKey?: number;
    actionSlot?: ReactNode;
    canSendEmpty?: boolean;
};

const ChatSendBlock = ({ onSend, disabled = false, draftText, draftKey, actionSlot, canSendEmpty = false }: ChatSendBlockProps) => {
    const editableRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!draftText || !editableRef.current) return;

        editableRef.current.innerText = draftText;
        editableRef.current.focus();
    }, [draftText, draftKey]);
    
    const handleInternalSend = () => {
        const text = editableRef.current?.innerText || "";
        if (text.trim() || canSendEmpty) {
            onSend(text);
            if (editableRef.current) editableRef.current.innerText = ""; // 전송 후 입력창 비우기
        }
    };
    
    return (
        <div className="flex items-end gap-2 p-4 border-t bg-gray-100">
            {actionSlot}
            <div className="flex-1 bg-white border border-gray-300 p-3 rounded-xl focus-within:ring-2 focus-within:ring-blue-400 transition-all">
                <div 
                    className="textbox outline-none text-stone-800 min-h-6 max-h-40 overflow-y-auto"
                    ref={editableRef}
                    contentEditable={!disabled}
                    role="textbox"
                    aria-multiline="true"
                    aria-disabled={disabled}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleInternalSend();
                        }
                    }}
                />
            </div>
            <button 
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-400 text-white px-5 py-2 rounded-xl font-medium transition-all"
                onClick={handleInternalSend}
                disabled={disabled}
            >
                Send
            </button>
        </div>
    );
};

export default ChatSendBlock;
