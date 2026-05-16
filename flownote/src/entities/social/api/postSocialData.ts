import { API_CORE_BASE_URL, authHeaders } from "../../../shared/api";
import axios from "axios";

export type SocialMessagePayload = {
  message: string;
  timestamp?: string | Date | null;
};

export type SocialRoomPayload = {
  name?: string;
  participantEmails?: string[];
  participantIds?: string[];
};

const postSocialRoom = async (roomData: SocialRoomPayload) => {
  try {
    const response = await axios.post(`${API_CORE_BASE_URL}/api/social`, roomData, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("Error posting social room:", error);
    throw error;
  }
};

const postSocialData = async (roomId: string, messageData: SocialMessagePayload) => {
  try {
    const response = await axios.post(`${API_CORE_BASE_URL}/api/social/${roomId}`, messageData, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("Error posting social data:", error);
    throw error;
  }
};

export { postSocialRoom };
export default postSocialData;
