export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "model" | "other";
  nickname?: string;
  timestamp: string | Date | null;
  message: string;
}
