import axios from "axios";
import { API_BASE_URL2 } from "../../../shared/api";
import type { UserDataProps } from "../../../widgets/SignUpWidget";

const postUserData = async (userData : UserDataProps) => {
    try {
        const response = await axios.post(`${API_BASE_URL2}/api/users`, userData);
        console.log('User data posted successfully:', response.data);
    } catch (error) {
        console.error('Error posting user data:', error);
    }  
};

export default postUserData;