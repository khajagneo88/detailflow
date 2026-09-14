import { apiClient } from "@/lib/api-client";
import type { Apartment, Priority, Project, ProjectListItem, ProjectStatus, Room } from "@/types";

export interface ApartmentCreateInput {
  name: string;
  level?: string | null;
  apartment_type?: string | null;
  description?: string | null;
  assigned_detailer_id?: number | null;
  due_date?: string | null;
  notes?: string | null;
}

export interface RoomCreateInput {
  name: string;
  code?: string | null;
  description?: string | null;
  apartment_id?: number | null;
  assigned_detailer_id?: number | null;
  priority: Priority;
  due_date?: string | null;
  estimated_hours?: number | null;
  notes?: string | null;
}

export interface ProjectCreateInput {
  project_number: string;
  name: string;
  client_name?: string;
  builder?: string;
  site_address?: string;
  project_manager?: string;
  description?: string;
  priority: Priority;
  status: ProjectStatus;
  team_leader_id?: number | null;
  start_date?: string | null;
  detailing_due_date?: string | null;
  installation_date?: string | null;
  estimated_hours?: number | null;
  notes?: string;
  assigned_detailer_ids: number[];
}

export const projectsApi = {
  list: (includeArchived = false) =>
    apiClient.get<ProjectListItem[]>(
      `/projects${includeArchived ? "?include_archived=true" : ""}`
    ),
  get: (id: number) => apiClient.get<Project>(`/projects/${id}`),
  create: (input: ProjectCreateInput) => apiClient.post<Project>("/projects", input),
  listApartments: (projectId: number) =>
    apiClient.get<Apartment[]>(`/projects/${projectId}/apartments`),
  listRooms: (projectId: number) => apiClient.get<Room[]>(`/projects/${projectId}/rooms`),
  createApartment: (projectId: number, input: ApartmentCreateInput) =>
    apiClient.post<Apartment>(`/projects/${projectId}/apartments`, input),
  createRoom: (projectId: number, input: RoomCreateInput) =>
    apiClient.post<Room>(`/projects/${projectId}/rooms`, input),
};
