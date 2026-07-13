import axios from "axios";
import { API_CORE_BASE_URL } from "@/shared/api";

interface LoginUserData {
  email: string;
  password: string;
}

interface LoginUserResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    nickname: string;
  };
}

const loginUserData = async (loginData: LoginUserData): Promise<LoginUserResponse> => {
  const response = await axios.post(`${API_CORE_BASE_URL}/api/users/login`, loginData);
  return response.data;
};

export default loginUserData;
