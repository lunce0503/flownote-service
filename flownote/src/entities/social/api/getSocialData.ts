import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import axios from "axios";

const getSocialRooms = async () => {
  try {
    const response = await axios.get(`${API_CORE_BASE_URL}/api/social`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching social data:", error);
    throw error;
  }
};

const getSocialMessages = async (roomId: string) => {
  try {
    const response = await axios.get(`${API_CORE_BASE_URL}/api/social/${roomId}`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching social messages:", error);
    throw error;
  }
};

export { getSocialMessages, getSocialRooms };
export default getSocialRooms;
