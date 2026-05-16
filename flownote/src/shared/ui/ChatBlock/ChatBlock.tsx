import type { ChatMessage } from "./type";
import ReactMarkdownRender from "../ReactMarkdownRender";
import { MoreVertical, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ChatBlockProps = ChatMessage & {
    canDelete?: boolean;
    onDelete?: (id: string) => void;
};

const ChatBlock = ({ id, sender, message, nickname, canDelete = false, onDelete }: ChatBlockProps) => {
    const isUser = sender === "user";
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isMenuOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [isMenuOpen]);

    return (
        <div className={`chat-block group flex w-full items-start gap-2 mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {canDelete && (
                <div className="relative mt-1 order-first" ref={menuRef}>
                    <button
                        type="button"
                        className="rounded-full p-1 text-stone-500 opacity-0 transition-opacity hover:bg-stone-100 hover:text-stone-900 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        onClick={() => setIsMenuOpen((open) => !open)}
                        aria-label="메시지 메뉴"
                    >
                        <MoreVertical size={17} />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute left-0 z-10 mt-1 w-24 rounded-md border border-stone-200 bg-white p-1 shadow-lg">
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    onDelete?.(id);
                                }}
                            >
                                <Trash2 size={13} />
                                삭제
                            </button>
                        </div>
                    )}
                </div>
            )}
            <div className={`chat-block-design max-w-[85%] p-3 rounded-2xl shadow-sm ${
                isUser 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
            }`}>
                {!isUser && nickname && (
                    <div className="mb-1 text-xs font-semibold text-stone-500">
                        {nickname}
                    </div>
                )}
                <div className="markdown-render text-sm leading-relaxed markdown-body">
                    <ReactMarkdownRender message={message}/>
                </div>
            </div>
        </div>
    );
};

export default ChatBlock;
