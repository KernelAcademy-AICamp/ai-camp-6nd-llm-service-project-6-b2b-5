export type Role = "parent" | "director" | "teacher" | "admin";

export interface UserProfile {
  id: string;
  role: Role;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export interface KindergartenRow {
  id: string;
  name: string;
  director_name: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassroomRow {
  id: string;
  kindergarten_id: string;
  name: string;
  age_group: number | null;
  capacity: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChildRow {
  id: string;
  classroom_id: string;
  name: string;
  birth_date: string;
  gender: "M" | "F" | null;
  address: string | null;
  photo_url: string | null;
  enrolled_at: string | null;
  status: "active" | "inactive" | "graduated";
  privacy_agreed_at: string | null;   // null = 개인정보 미동의
  privacy_agreed_by: string | null;   // 동의한 보호자 profiles.id
  created_at: string;
  updated_at: string;
}

export interface ParentChildRow {
  id: string;
  parent_id: string | null;           // null = 앱 계정 없는 비상연락처
  child_id: string;
  guardian_name: string | null;       // parent_id = null 일 때만 사용
  guardian_phone: string | null;      // parent_id = null 일 때만 사용
  relation: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffClassroomRow {
  id: string;
  staff_id: string;
  classroom_id: string;
  role_in_class: "lead" | "assistant";
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

// 원아 상세 조회 시 보호자 정보를 합쳐서 사용하는 뷰 타입
export interface GuardianInfo {
  id: string;
  relation: string;
  is_primary: boolean;
  name: string;         // parent_id 있으면 profiles.name, 없으면 guardian_name
  phone: string | null; // parent_id 있으면 profiles.phone, 없으면 guardian_phone
  has_account: boolean; // parent_id 존재 여부
}
