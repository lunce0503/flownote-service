import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import axios from "axios";

const deleteChatMessage = async (messageId: string) => {
  const response = await axios.delete(`${API_CORE_BASE_URL}/api/chat/${messageId}`, {
    headers: authHeaders(),
  });
  return response.data;
};

const deleteAllChatMessages = async () => {
  const response = await axios.delete(`${API_CORE_BASE_URL}/api/chat`, {
    headers: authHeaders(),
  });
  return response.data;
};

export { deleteAllChatMessages };
export default deleteChatMessage;
