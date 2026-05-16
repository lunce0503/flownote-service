import { useRef,useState } from "react";

const ChatSendBlock = ({ onSend, onMode, isAsking}: { onSend: (text: string) => void; onMode: () => void; isAsking:boolean}) => {
    const editableRef = useRef<HTMLDivElement>(null);
    
    const handleInternalSend = () => {
        const text = editableRef.current?.innerText || "";
        if (text.trim()) {
            onSend(text);
            if (editableRef.current) editableRef.current.innerText = ""; // 전송 후 입력창 비우기
        }
    };
    
    return (
        <div className="flex items-end gap-2 p-4 border-t bg-gray-100">
            <button className={`mode-button  w-12 h-10 rounded-xl font-bold transition-all ease-in-out ${ 
                isAsking 
                ? 'bg-blue-600  text-white hover:bg-blue-700' 
                : 'bg-gray-800 text-white hover:bg-gray-900'}`}
                onClick={onMode} 
            >
                AI
            </button>
            <div className="flex-1 bg-white border border-gray-300 p-3 rounded-xl focus-within:ring-2 focus-within:ring-blue-400 transition-all">
                <div 
                    className="textbox outline-none text-stone-800 min-h-6 max-h-40 overflow-y-auto"
                    ref={editableRef}
                    contentEditable 
                    role="textbox"
                    aria-multiline="true"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleInternalSend();
                        }
                    }}
                />
            </div>
            <button 
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-5 py-2 rounded-xl font-medium transition-all"
                onClick={handleInternalSend}
            >
                Send
            </button>
        </div>
    );
};

export default ChatSendBlock;