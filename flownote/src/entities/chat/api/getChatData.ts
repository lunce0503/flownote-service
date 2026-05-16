import { API_BASE_URL, authHeaders } from "../../../shared/api";
import axios from "axios";

const getChatData = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/chat/`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching chat data:", error);
    throw error;
  }
};

export default getChatData;
