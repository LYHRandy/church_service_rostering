export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      assignments: {
        Row: {
          assigned_by: string | null
          conflict_acknowledged: boolean
          created_at: string
          duty_slot_id: string
          id: string
          status: Database["public"]["Enums"]["assignment_status"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          conflict_acknowledged?: boolean
          created_at?: string
          duty_slot_id: string
          id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          conflict_acknowledged?: boolean
          created_at?: string
          duty_slot_id?: string
          id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_duty_slot_id_fkey"
            columns: ["duty_slot_id"]
            isOneToOne: false
            referencedRelation: "duty_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_slots: {
        Row: {
          created_at: string
          created_by: string | null
          end_at: string | null
          headcount: number
          id: string
          ministry_id: string
          position: string
          service_date: string
          start_at: string
          status: Database["public"]["Enums"]["slot_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          headcount?: number
          id?: string
          ministry_id: string
          position: string
          service_date: string
          start_at: string
          status?: Database["public"]["Enums"]["slot_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          headcount?: number
          id?: string
          ministry_id?: string
          position?: string
          service_date?: string
          start_at?: string
          status?: Database["public"]["Enums"]["slot_status"]
        }
        Relationships: [
          {
            foreignKeyName: "duty_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_slots_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          token?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          ministry_id: string
          positions: string[]
          role: Database["public"]["Enums"]["ministry_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          ministry_id: string
          positions?: string[]
          role?: Database["public"]["Enums"]["ministry_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          ministry_id?: string
          positions?: string[]
          role?: Database["public"]["Enums"]["ministry_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ministries: {
        Row: {
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["ministry_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["ministry_status"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["ministry_status"]
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: number
          payload: Json
          scheduled_for: string
          sent_at: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: never
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: never
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          global_role: Database["public"]["Enums"]["global_role"]
          id: string
          name: string
          phone: string | null
          telegram_id: number | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          global_role?: Database["public"]["Enums"]["global_role"]
          id?: string
          name: string
          phone?: string | null
          telegram_id?: number | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          global_role?: Database["public"]["Enums"]["global_role"]
          id?: string
          name?: string
          phone?: string | null
          telegram_id?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _confirm: {
        Args: { p_assignment_id: string; p_user_id: string }
        Returns: Json
      }
      _require_actor: { Args: never; Returns: string }
      _require_head_or_pastor: {
        Args: { p_ministry_id: string }
        Returns: undefined
      }
      add_member: {
        Args: {
          p_ministry_id?: string
          p_name: string
          p_phone?: string
          p_positions?: string[]
          p_role?: Database["public"]["Enums"]["ministry_role"]
        }
        Returns: string
      }
      app_global_role: {
        Args: never
        Returns: Database["public"]["Enums"]["global_role"]
      }
      app_user_id: { Args: never; Returns: string }
      archive_ministry: { Args: { p_ministry_id: string }; Returns: undefined }
      assign_member: {
        Args: {
          p_allow_conflict?: boolean
          p_duty_slot_id: string
          p_user_id: string
        }
        Returns: Json
      }
      check_conflicts: {
        Args: { p_end?: string; p_start: string; p_user_id: string }
        Returns: {
          assignment_id: string
          duty_slot_id: string
          end_at: string
          ministry_name: string
          position: string
          start_at: string
        }[]
      }
      confirm_assignment: { Args: { p_assignment_id: string }; Returns: Json }
      confirm_assignment_tg: {
        Args: { p_assignment_id: string; p_telegram_id: number }
        Returns: Json
      }
      create_duty_slot: {
        Args: {
          p_end_at?: string
          p_headcount?: number
          p_ministry_id: string
          p_position?: string
          p_service_date: string
          p_start_at: string
        }
        Returns: string
      }
      create_invite: { Args: { p_user_id: string }; Returns: string }
      create_ministry: { Args: { p_name: string }; Returns: string }
      delete_duty_slot: { Args: { p_slot_id: string }; Returns: undefined }
      duty_buffer: { Args: never; Returns: string }
      enqueue_day_before_reminders: { Args: never; Returns: number }
      has_ministry_role: {
        Args: {
          p_min_role: Database["public"]["Enums"]["ministry_role"]
          p_ministry_id: string
        }
        Returns: boolean
      }
      invoke_send_notifications: { Args: never; Returns: undefined }
      link_telegram_account: {
        Args: { p_telegram_id: number; p_token: string }
        Returns: Json
      }
      publish_roster: {
        Args: { p_from: string; p_ministry_id: string; p_to: string }
        Returns: Json
      }
      remove_assignment: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      remove_membership: {
        Args: { p_ministry_id: string; p_user_id: string }
        Returns: undefined
      }
      update_duty_slot: {
        Args: {
          p_end_at: string
          p_headcount: number
          p_position: string
          p_slot_id: string
          p_start_at: string
        }
        Returns: undefined
      }
      upsert_membership: {
        Args: {
          p_ministry_id: string
          p_positions?: string[]
          p_role: Database["public"]["Enums"]["ministry_role"]
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      assignment_status: "pending" | "confirmed" | "swap_requested" | "swapped"
      global_role: "none" | "staff" | "pastor" | "admin"
      ministry_role: "member" | "ic" | "head"
      ministry_status: "active" | "archived"
      notification_type: "reminder" | "published"
      slot_status: "draft" | "published"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      assignment_status: ["pending", "confirmed", "swap_requested", "swapped"],
      global_role: ["none", "staff", "pastor", "admin"],
      ministry_role: ["member", "ic", "head"],
      ministry_status: ["active", "archived"],
      notification_type: ["reminder", "published"],
      slot_status: ["draft", "published"],
    },
  },
} as const

