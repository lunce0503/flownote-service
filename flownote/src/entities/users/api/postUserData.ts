import axios from "axios";
import { API_CORE_BASE_URL } from "@/shared/api";
import type { UserDataProps } from "../model/types";

const postUserData = async (userData : UserDataProps) => {
    if (!API_CORE_BASE_URL) {
        throw new Error("사용자 API 기본 URL이 설정되지 않았습니다.");
    }
    const response = await axios.post(`${API_CORE_BASE_URL}/api/users`, userData);
    return response.data;
};

export default postUserData;
