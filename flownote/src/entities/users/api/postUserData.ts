import axios from "axios";
import { API_CORE_BASE_URL } from "@/shared/api";
import type { UserDataProps } from "../model/types";

const postUserData = async (userData : UserDataProps) => {
    try {
        const response = await axios.post(`${API_CORE_BASE_URL}/api/users`, userData);
        console.log('User data posted successfully:', response.data);
    } catch (error) {
        console.error('Error posting user data:', error);
    }  
};

export default postUserData;
