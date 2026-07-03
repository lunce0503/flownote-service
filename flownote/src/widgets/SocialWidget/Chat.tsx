import { useState, useRef, useEffect } from "react";
import { ChatBlock, ChatSendBlock, type ChatMessage } from "../../shared/ui/ChatBlock";
import { v4 as uuidv4 } from 'uuid';
import postSocialData, { postSocialRoom } from "../../entities/social/api/postSocialData";
import { getSocialMessages, getSocialRooms } from "../../entities/social/api/getSocialData";
import deleteSocialMessage, { deleteSocialRoom } from "../../entities/social/api/deleteSocialData";
import searchUserData, { type UserSearchResult } from "../../entities/users/api/searchUserData";
import { useAuth } from "../../shared/auth/AuthContext";
import uploadFileData from "../../shared/api/uploadFileData";
import { API_CORE_BASE_URL } from "../../shared/api";
import { FilePlus2, MessageSquareText, MoreVertical, Users, X } from "lucide-react";

type SocialMessage = {
    id: string;
    room_id: string;
    user_id: string;
    nickname: string;
    message: string;
    timestamp: string | Date | null;
    mine: boolean;
};

type SocialRoomMember = {
    id: string;
    username: string;
    nickname: string;
};

type SocialRoom = {
    id: string;
    name: string | null;
    members: SocialRoomMember[];
    lastMessage: string | null;
    updatedAt: string;
};

type SocialRoomResponse = Omit<SocialRoom, "lastMessage" | "updatedAt"> & {
    lastMessage?: string | null;
    last_message?: string | null;
    updatedAt?: string;
    updated_at?: string;
};

const toChatMessage = (message: SocialMessage): ChatMessage => ({
    id: message.id,
    sender: message.mine ? "user" : "other",
    nickname: message.mine ? undefined : message.nickname,
    timestamp: message.timestamp,
    message: message.message,
});

const toSocialRoom = (room: SocialRoomResponse): SocialRoom => ({
    id: room.id,
    name: room.name,
    members: room.members,
    lastMessage: room.lastMessage ?? room.last_message ?? null,
    updatedAt: room.updatedAt ?? room.updated_at ?? "",
});

const Chat = () => {
    const { user } = useAuth();
    const [rooms, setRooms] = useState<SocialRoom[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [roomName, setRoomName] = useState("");
    const [userQuery, setUserQuery] = useState("");
    const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [openRoomMenuId, setOpenRoomMenuId] = useState<string | null>(null);

    const chatContainerRef = useRef<HTMLDivElement>(null);
    const roomMenuRef = useRef<HTMLDivElement>(null);
    
    const scrollToBottom = () => {
            if (chatContainerRef.current) {
                const container = chatContainerRef.current;
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: "auto"
                });
        }
    }

    const roomTitle = (room: SocialRoom) => {
        if (room.name) return room.name;
        const visibleMembers = room.members.filter((member) => member.id !== user?.id);
        return (visibleMembers.length > 0 ? visibleMembers : room.members)
            .map((member) => member.nickname)
            .join(", ");
    };

    const buildFileMarkdown = (file: File, fileUrl: string) => {
        const absoluteUrl = fileUrl.startsWith("http") ? fileUrl : `${API_CORE_BASE_URL}${fileUrl}`;
        const safeName = file.name.replace(/[\[\]()]/g, "_");

        if (file.type.startsWith("image/")) {
            return `![${safeName}](${absoluteUrl})`;
        }

        if (file.type.startsWith("video/")) {
            return `[동영상: ${safeName}](${absoluteUrl})`;
        }

        return `[파일: ${safeName}](${absoluteUrl})`;
    };

    const getRooms = async () => {
        const response = await getSocialRooms();
        const data = Array.isArray(response) ? response : response.rooms || [];
        const nextRooms = data.map(toSocialRoom);
        setRooms(nextRooms);
        setSelectedRoomId((currentRoomId) => {
            if (!currentRoomId) return nextRooms[0]?.id ?? null;
            return nextRooms.some((room) => room.id === currentRoomId) ? currentRoomId : nextRooms[0]?.id ?? null;
        });
    };

    const getMessages = async () => {
            if (!selectedRoomId) {
                setMessages([]);
                return;
            }
            const response = await getSocialMessages(selectedRoomId);
            const data = Array.isArray(response) ? response : response.messages || [];
            setMessages(data.map(toChatMessage)); 
        };

    const sendUserMessage = async (text:string) => {
        if (!selectedRoomId) return;
        const filesToUpload = selectedFiles;
        if (!text.trim() && filesToUpload.length === 0) return;
        const optimisticText = [
            text.trim(),
            ...filesToUpload.map((file) => `[첨부 업로드 중: ${file.name}]`),
        ].filter(Boolean).join("\n\n");
        const userMessage: ChatMessage = {
                id:uuidv4(),
                sender: "user",
                timestamp: new Date(),
                message: optimisticText,
            };

            setMessages(prev => [...prev, userMessage]);
            setSelectedFiles([]);
            setIsLoading(true);

            try {
                const uploadedFiles = await Promise.all(filesToUpload.map(async (file) => {
                    const uploaded = await uploadFileData(file);
                    return buildFileMarkdown(file, uploaded.fileUrl);
                }));
                const message = [text.trim(), ...uploadedFiles].filter(Boolean).join("\n\n");
                const data: SocialMessage = await postSocialData(selectedRoomId, {
                    message,
                    timestamp: new Date(),
                }); 
                setMessages(prev => prev.map((message) => (
                    message.id === userMessage.id ? toChatMessage(data) : message
                )));
                getRooms();
                
            } catch (error) {
                console.error("Unexpected Error:", error);
            } finally {
                setIsLoading(false);
            }
    }

    const handleSend = async (text: string) => {
        sendUserMessage(text);
    };

    const handleCreateRoom = async () => {
        if (selectedUsers.length === 0 || isLoading) return;

        setIsLoading(true);
        try {
            const room = toSocialRoom(await postSocialRoom({
                name: roomName.trim() || undefined,
                participantIds: selectedUsers.map((selectedUser) => selectedUser.id),
            }));
            setRooms((prev) => [room, ...prev]);
            setSelectedRoomId(room.id);
            setMessages([]);
            setRoomName("");
            setUserQuery("");
            setUserResults([]);
            setSelectedUsers([]);
        } catch (error) {
            console.error("Unexpected Error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectUser = (nextUser: UserSearchResult) => {
        setSelectedUsers((prev) => (
            prev.some((selectedUser) => selectedUser.id === nextUser.id)
                ? prev
                : [...prev, nextUser]
        ));
        setUserQuery("");
        setUserResults([]);
    };

    const handleRemoveUser = (userId: string) => {
        setSelectedUsers((prev) => prev.filter((selectedUser) => selectedUser.id !== userId));
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!selectedRoomId) return;
        setMessages((prev) => prev.filter((message) => message.id !== messageId));

        try {
            await deleteSocialMessage(selectedRoomId, messageId);
            getRooms();
        } catch (error) {
            console.error("Unexpected Error:", error);
            getMessages();
        }
    };

    const handleDeleteRoom = async (roomId: string) => {
        setOpenRoomMenuId(null);
        const previousRooms = rooms;
        const previousSelectedRoomId = selectedRoomId;
        const nextRooms = rooms.filter((room) => room.id !== roomId);
        setRooms(nextRooms);
        setSelectedRoomId((currentRoomId) => currentRoomId === roomId ? nextRooms[0]?.id ?? null : currentRoomId);
        if (selectedRoomId === roomId) {
            setMessages([]);
        }

        try {
            await deleteSocialRoom(roomId);
            await getRooms();
        } catch (error) {
            console.error("Unexpected Error:", error);
            setRooms(previousRooms);
            setSelectedRoomId(previousSelectedRoomId);
            void getRooms();
        }
    };

    const handleFileSelect = (files: FileList | null) => {
        if (!files) return;
        setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    };

    const handleRemoveFile = (fileIndex: number) => {
        setSelectedFiles((prev) => prev.filter((_, index) => index !== fileIndex));
    };

    useEffect(() => {
        getRooms();

        const intervalId = window.setInterval(getRooms, 3000);
        window.addEventListener("focus", getRooms);
        document.addEventListener("visibilitychange", getRooms);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", getRooms);
            document.removeEventListener("visibilitychange", getRooms);
        };
    },[]);

    useEffect(() => {
        if (!openRoomMenuId) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!roomMenuRef.current?.contains(event.target as Node)) {
                setOpenRoomMenuId(null);
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [openRoomMenuId]);

    useEffect(() => {
        const timeoutId = window.setTimeout(async () => {
            if (userQuery.trim().length < 2) {
                setUserResults([]);
                return;
            }

            try {
                const results = await searchUserData(userQuery);
                const selectedUserIds = new Set(selectedUsers.map((selectedUser) => selectedUser.id));
                setUserResults(results.filter((result) => !selectedUserIds.has(result.id)));
            } catch (error) {
                console.error("Unexpected Error:", error);
                setUserResults([]);
            }
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [selectedUsers, userQuery]);

    useEffect(() => {
        getMessages();
        const intervalId = window.setInterval(getMessages, 5000);
        return () => window.clearInterval(intervalId);
    },[selectedRoomId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    return (
        <div className="grid min-h-[calc(100vh-128px)] grid-cols-1 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 shadow-xl md:grid-cols-[300px_1fr]">
            <aside className="border-b bg-white p-3 md:border-b-0 md:border-r">
                <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-stone-50 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-700">
                            <Users size={14} />
                            Rooms
                        </div>
                        <div className="mt-1 text-xl font-black text-stone-950">{rooms.length}</div>
                    </div>
                    <div className="rounded-xl bg-stone-50 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase text-blue-700">
                            <MessageSquareText size={14} />
                            Chat
                        </div>
                        <div className="mt-1 text-xl font-black text-stone-950">{messages.length}</div>
                    </div>
                </div>
                <div className="mb-3 space-y-2 rounded-lg border border-stone-200 p-3">
                    <input
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="톡방 이름"
                        value={roomName}
                        onChange={(event) => setRoomName(event.target.value)}
                    />
                    <div className="space-y-2">
                        <input
                            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="사용자 검색"
                            value={userQuery}
                            onChange={(event) => setUserQuery(event.target.value)}
                        />
                        {selectedUsers.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {selectedUsers.map((selectedUser) => (
                                    <button
                                        key={selectedUser.id}
                                        type="button"
                                        className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
                                        onClick={() => handleRemoveUser(selectedUser.id)}
                                    >
                                        {selectedUser.nickname}
                                    </button>
                                ))}
                            </div>
                        )}
                        {userResults.length > 0 && (
                            <div className="max-h-36 overflow-y-auto rounded-md border border-stone-200 bg-white">
                                {userResults.map((result) => (
                                    <button
                                        key={result.id}
                                        type="button"
                                        className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-amber-50"
                                        onClick={() => handleSelectUser(result)}
                                    >
                                        <span className="font-semibold">{result.nickname}</span>
                                        <span className="ml-2 text-xs text-stone-500">@{result.username}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="w-full rounded-md bg-stone-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                        onClick={handleCreateRoom}
                        disabled={isLoading || selectedUsers.length === 0}
                    >
                        톡방 만들기
                    </button>
                </div>
                <div className="space-y-2">
                    {rooms.map((room) => (
                        <div
                            key={room.id}
                            className={`group relative flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors ${
                                selectedRoomId === room.id
                                    ? "border-stone-900 bg-stone-900"
                                    : "border-stone-200 bg-stone-50 hover:bg-amber-50"
                            }`}
                        >
                            <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => setSelectedRoomId(room.id)}
                            >
                                <div className={`truncate text-sm font-semibold ${selectedRoomId === room.id ? "text-white" : "text-stone-800"}`}>{roomTitle(room)}</div>
                                <div className={`truncate text-xs ${selectedRoomId === room.id ? "text-stone-300" : "text-stone-500"}`}>{room.lastMessage || "메시지가 없습니다."}</div>
                            </button>
                            <div className="relative shrink-0" ref={openRoomMenuId === room.id ? roomMenuRef : undefined}>
                                <button
                                    type="button"
                                    className="rounded-full p-1 text-stone-500 opacity-0 transition-opacity hover:bg-stone-100 hover:text-stone-950 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                    aria-label="톡방 메뉴"
                                    onClick={() => setOpenRoomMenuId((currentId) => currentId === room.id ? null : room.id)}
                                >
                                    <MoreVertical size={17} />
                                </button>
                                {openRoomMenuId === room.id && (
                                    <div className="absolute right-0 top-8 z-20 w-28 rounded-lg border border-stone-200 bg-white p-1 shadow-xl">
                                        <button
                                            type="button"
                                            className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                                            onClick={() => void handleDeleteRoom(room.id)}
                                        >
                                            톡방 삭제
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </aside>
            <div className="flex min-h-[560px] flex-col bg-stone-100">
                <div 
                    className="m-1 flex flex-1 flex-col overflow-y-auto rounded-xl bg-white p-4"
                    ref={chatContainerRef}
                >
                    {messages.map((msg) => (
                        <ChatBlock
                            key={msg.id}
                            {...msg}
                            canDelete={msg.sender === "user"}
                            onDelete={handleDeleteMessage}
                        />
                    ))}
                    {selectedRoomId === null && (
                        <div className="m-auto text-sm text-stone-500">톡방을 만들거나 선택하세요.</div>
                    )}
                </div>
                {selectedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-t bg-white px-4 py-2">
                        {selectedFiles.map((file, index) => (
                            <span
                                key={`${file.name}-${file.lastModified}-${index}`}
                                className="inline-flex max-w-full items-center gap-2 rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-700"
                            >
                                <span className="truncate">{file.name}</span>
                                <button type="button" onClick={() => handleRemoveFile(index)} aria-label={`${file.name} 제거`}>
                                    <X size={13} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="chat-send-block">
                    <ChatSendBlock
                        onSend={handleSend}
                        disabled={isLoading || !selectedRoomId}
                        canSendEmpty={selectedFiles.length > 0}
                        actionSlot={(
                            <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-50">
                                <FilePlus2 size={20} />
                                <input
                                    className="sr-only"
                                    type="file"
                                    multiple
                                    onChange={(event) => {
                                        handleFileSelect(event.target.files);
                                        event.target.value = "";
                                    }}
                                />
                            </label>
                        )}
                    />
                </div>
            </div>
        </div>
    ); 
};

export default Chat;
