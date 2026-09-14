import { apiClient } from "@/lib/api-client";
import type { User, UserRole } from "@/types";

export interface UserCreateInput {
  email: string;
  full_name: string;
  role: UserRole;
  password: string;
}

export interface UserUpdateInput {
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

export const usersApi = {
  list: () => apiClient.get<User[]>("/users"),
  create: (input: UserCreateInput) => apiClient.post<User>("/users", input),
  update: (id: number, input: UserUpdateInput) => apiClient.patch<User>(`/users/${id}`, input),
};
