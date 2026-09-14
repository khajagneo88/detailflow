import { apiClient } from "@/lib/api-client";
import type { User } from "@/types";

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<User>("/auth/login", { email, password }),
  logout: () => apiClient.post<void>("/auth/logout"),
  me: () => apiClient.get<User>("/auth/me"),
};
