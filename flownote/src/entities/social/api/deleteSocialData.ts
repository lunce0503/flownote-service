import { API_CORE_BASE_URL, authHeaders } from "../../../shared/api";
import axios from "axios";

const deleteSocialMessage = async (roomId: string, messageId: string) => {
  const response = await axios.delete(`${API_CORE_BASE_URL}/api/social/${roomId}/${messageId}`, {
    headers: authHeaders(),
  });
  return response.data;
};

const deleteSocialRoom = async (roomId: string) => {
  const response = await axios.delete(`${API_CORE_BASE_URL}/api/social/${roomId}`, {
    headers: authHeaders(),
  });
  return response.data;
};

export { deleteSocialRoom };
export default deleteSocialMessage;
