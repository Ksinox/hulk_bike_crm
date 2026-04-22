export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      scooter_models: {
        Row: {
          id: string
          name: string
          model_code: string
          specs: Json
          base_price: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          model_code: string
          specs: Json
          base_price: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          model_code?: string
          specs?: Json
          base_price?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      scooter_pricing_history: {
        Row: {
          id: string
          model_id: string
          pricing_type: string
          price: number
          effective_from: string
          effective_to: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          model_id: string
          pricing_type: string
          price: number
          effective_from?: string
          effective_to?: string | null
          created_at?: string
          created_by: string
        }
        Update: {
          id?: string
          model_id?: string
          pricing_type?: string
          price?: number
          effective_from?: string
          effective_to?: string | null
          created_at?: string
          created_by?: string
        }
      }
      testimonials: {
        Row: {
          id: string
          user_id: string
          name: string
          role: string
          rating: number
          text: string
          income_before: number
          income_after: number
          avatar_url: string | null
          video_url: string | null
          video_thumbnail: string | null
          likes: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          role: string
          rating: number
          text: string
          income_before: number
          income_after: number
          avatar_url?: string | null
          video_url?: string | null
          video_thumbnail?: string | null
          likes?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          role?: string
          rating?: number
          text?: string
          income_before?: number
          income_after?: number
          avatar_url?: string | null
          video_url?: string | null
          video_thumbnail?: string | null
          likes?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
    Functions: {
      get_current_pricing: {
        Args: {
          model_id: string
        }
        Returns: {
          pricing_type: string
          price: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}