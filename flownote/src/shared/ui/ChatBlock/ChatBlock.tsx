import type { ChatMessage } from "./type";
import ReactMarkdownRender from "../ReactMarkdownRender";

const ChatBlock = ({ sender, message }: ChatMessage) => {
    const isUser = sender === "user";

    return (
        <div className={`chat-block flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`chat-block-design max-w-[85%] p-3 rounded-2xl shadow-sm ${
                isUser 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
            }`}>
                <div className="markdown-render text-sm leading-relaxed markdown-body">
                    <ReactMarkdownRender message={message}/>
                </div>
            </div>
        </div>
    );
};

export default ChatBlock;