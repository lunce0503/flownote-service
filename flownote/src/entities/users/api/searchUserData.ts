import axios from "axios";
import { API_CORE_BASE_URL, authHeaders } from "../../../shared/api";

export type UserSearchResult = {
  id: string;
  username: string;
  nickname: string;
};

const searchUserData = async (query: string): Promise<UserSearchResult[]> => {
  if (query.trim().length < 2) return [];

  const response = await axios.get(`${API_CORE_BASE_URL}/api/users/search`, {
    headers: authHeaders(),
    params: { q: query },
  });
  return response.data;
};

export default searchUserData;
