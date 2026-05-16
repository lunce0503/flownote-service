export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "model";
  timestamp: string | Date | null;
  message: string;
}
