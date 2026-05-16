import { API_CORE_BASE_URL, authHeaders } from ".";
import axios from "axios";

export type UploadedFileData = {
  filename: string;
  fileUrl: string;
};

const uploadFileData = async (file: File): Promise<UploadedFileData> => {
  const body = new FormData();
  body.append("file", file);

  const response = await axios.post(`${API_CORE_BASE_URL}/api/upload`, body, {
    headers: authHeaders(),
  });

  return response.data;
};

export default uploadFileData;
