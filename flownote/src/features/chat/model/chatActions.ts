import type { Dispatch, SetStateAction } from "react";
import type { ChatMessage } from "@/shared/ui/ChatBlock";
import { deleteAllChatMessages, deleteChatMessage, postChatData } from "@/entities/chat";

type SetMessages = Dispatch<SetStateAction<ChatMessage[]>>;

export const sendChatMessageOptimistically = async (
    message: ChatMessage,
    setMessages: SetMessages,
) => {
    setMessages((current) => [...current, message]);
    try {
        await postChatData(message);
    } catch (error) {
        setMessages((current) => current.filter((candidate) => candidate.id !== message.id));
        throw error;
    }
};

export const deleteChatMessageOptimistically = async (
    messageId: string,
    setMessages: SetMessages,
    reloadMessages: () => Promise<void>,
) => {
    setMessages((current) => current.filter((message) => message.id !== messageId));
    try {
        await deleteChatMessage(messageId);
    } catch (error) {
        await reloadMessages();
        throw error;
    }
};

export const clearChatMessagesOptimistically = async (
    setMessages: SetMessages,
    reloadMessages: () => Promise<void>,
) => {
    setMessages([]);
    try {
        await deleteAllChatMessages();
    } catch (error) {
        await reloadMessages();
        throw error;
    }
};
