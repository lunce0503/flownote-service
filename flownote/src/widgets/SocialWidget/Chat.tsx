import { useState, useRef, useEffect } from "react";
import axios from 'axios';
import { ChatBlock, ChatSendBlock, type ChatMessage } from "../../shared/ui/ChatBlock";
import { v4 as uuidv4 } from 'uuid';
import { API_AI_BASE_URL } from "../../shared/api";
import postChatData from "../../entities/chat/api/postChatData";
import getChatData from "../../entities/chat/api/getChatData";

const Chat = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAsking, setIsAsking] = useState(false);

    const chatContainerRef = useRef<HTMLDivElement>(null);
    
    const scrollToBottom = () => {
            if (chatContainerRef.current) {
                const container = chatContainerRef.current;
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: "auto"
                });
        }
    }

    const getMessages = async () => {
            const response = await getChatData();
            const data = Array.isArray(response) ? response : response.messages || [];
            setMessages(data); 
        };

    const askAgent = async () => {
        try{
            const response = await fetch(`${API_AI_BASE_URL}/api/aiclient/ask_stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // 현재 백엔드에서 받는 body가 없으므로 생략하거나 빈 객체 전달
                body: JSON.stringify({user_text: messages[messages.length - 1].message}), 
            });
            if (!response.body) throw new Error("응답 바디가 없습니다.");

            // 2. 스트림 읽기 준비
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let done = false;

            // AI의 답변을 담을 임시 변수
            let aiResponseText = "";

            // 3. 데이터 조각(Chunk) 반복해서 읽기
            while (!done) {
                const { value, done: doneReading } = await reader.read();   
                done = doneReading;
            
                // 8비트 숫자를 텍스트로 변환
                const chunk = decoder.decode(value, { stream: true });
                aiResponseText=aiResponseText+chunk;

                // 리액트 상태 업데이트 (실시간으로 글자가 타이핑되는 효과)
                setMessages((prev : ChatMessage[]) => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.sender === "assistant") {
                        // 마지막 메시지가 assistant면 내용만 교체
                        return [...prev.slice(0, -1), { ...lastMsg, message: aiResponseText }];
                    } else {
                        const newAiMsg: ChatMessage = {
                            id:uuidv4(), // string 형식의 고유 ID
                            sender: "assistant",     // 리터럴 타입 'assistant' 일치
                            timestamp: new Date(),    // 필수 Date 객체 추가
                            message: aiResponseText,  // 현재까지 받은 텍스트
                        };
                        return [...prev, newAiMsg];
                    }
                });
            }
        } catch (error) {
            console.error("fetch error:", error)
        } finally{
            setIsAsking(false);
        }
    }

    const sendUserMessage = async (text:string) => {
        const userMessage: ChatMessage = {
                id:uuidv4(),
                sender: "user",
                timestamp: new Date(),
                message: text,
            };

            setMessages(prev => [...prev, userMessage]);
            setIsLoading(true);

            try {
                const data: ChatMessage = await postChatData({
                    message: text,
                    sender: "user",
                    timestamp: new Date(),
                    id:uuidv4()
                }); 
                
                console.log(data.message);
                console.log(data);
                
            } catch (error) {
                // axios 에러 핸들링
                if (axios.isAxiosError(error)) {
                    console.error("Axios Error:", error.response?.data || error.message);
                } else {
                    console.error("Unexpected Error:", error);
                }
            } finally {
                setIsLoading(false);
            }
    }

    const handleSend = async (text: string) => {
        if (isAsking === false) {
            sendUserMessage(text);
        } 
        
        if (isAsking === true) {
            sendUserMessage(text);
            console.log("AI mode");
            askAgent();
        }
    };

    const handleChatMode = () => {
        setIsAsking(!isAsking);
        console.log(!isAsking);
    }

    useEffect(() => {
        getMessages();
        scrollToBottom();
    },[]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    return (
        <div className="flex flex-col h-150 m-4 border rounded-2xl overflow-hidden shadow-xl bg-gray-100">
            <div 
                className="flex-1 m-1 overflow-y-auto p-4 flex flex-col"
                ref={chatContainerRef}
            >
                {messages.map((msg) => (
                    <ChatBlock key={msg.id} {...msg} />
                ))}
            </div>
            <div className="chat-send-block">
                <ChatSendBlock onSend={handleSend} onMode={handleChatMode} isAsking={isAsking}/>
            </div>
        </div>
    ); 
};

export default Chat;
