import type { Block } from "@blocknote/core";

export interface BlockDataProps {
  id: string;
  title: string;
  content: Block[];
  created_at: Date | string;
  updated_at?: string;
  revision?: number;
  client_id?: string;
}
