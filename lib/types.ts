export type Grade = 0 | 1 | 2 | 3 | 4 | 5

export const GRADE_NAMES: Record<Grade, string> = {
  0: "G0 Jumbo",
  1: "G1 X-Large",
  2: "G2 Large",
  3: "G3 Medium",
  4: "G4 Small",
  5: "G5 Petite",
}

export const FALLBACK: Record<Grade, number> = {
  0: 4.8,
  1: 4.65,
  2: 4.4,
  3: 4.25,
  4: 4.1,
  5: 3.95,
}

export interface GradePrice {
  grade: Grade
  name: string
  avg: number
  min: number | null
  max: number | null
  changePct: number
  history7d: number[]
}

export interface PricePoint {
  date: string
  price: number
  min?: number | null
  max?: number | null
  diesel?: number | null
}

export interface OilPoint {
  date: string
  diesel_price: number
}

export interface ForecastPoint {
  date: string
  price: number
}

export interface ContextFactors {
  date?: string
  avg_temp_celsius?: number | null
  temp_category?: string | null
  disease_status?: string | null
  disease_supply_impact?: string | null
  corn_price_thb?: number | null
  soybean_meal_price_thb?: number | null
  demand_shock?: string | null
  supply_shock?: string | null
  diesel_price_thb?: number | null
}

export interface UserProfile {
  user_id: string
  email?: string | null
  full_name?: string | null
  business_name?: string | null
  business_type?: string | null
  consumption_level?: string | null
  daily_egg_usage?: number | null
  preferred_grade?: string | null
  phone?: string | null
  province?: string | null
}

export interface AiProfile {
  user_id: string
  business_type?: string | null
  preferred_grade?: string | null
  daily_egg_usage?: number | null
  avg_monthly_spend?: number | null
  price_sensitivity?: string | null
  typical_restock_day?: string | null
  supplier_region?: string | null
  personal_price_g0?: number | null
  personal_price_g1?: number | null
  personal_price_g2?: number | null
  personal_price_g3?: number | null
  personal_price_g4?: number | null
  personal_price_g5?: number | null
  price_offset_g0?: number | null
  price_offset_g1?: number | null
  price_offset_g2?: number | null
  price_offset_g3?: number | null
  price_offset_g4?: number | null
  price_offset_g5?: number | null
  collected_business?: boolean
  collected_grade?: boolean
  collected_usage?: boolean
  collected_price?: boolean
  collected_supplier?: boolean
  profile_score?: number
}

export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
  metadata?: Record<string, unknown> | null
  timestamp?: string
}

export interface NewsItem {
  id?: number
  title: string
  url: string | null
  source: string | null
  source_logo?: string | null
  image_url?: string | null
  snippet?: string | null
  category?: string | null
  published_at?: string | null
  time_ago_label?: string | null
}

export interface AgentSignal {
  action: "BUY NOW" | "HOLD" | "WAIT"
  grade?: string
  quantity: number
  strength: string
  confidence: number
  context: string
  last_price: number
}

export interface AgentResult {
  text: string
  metadata: Record<string, unknown> | null
  signal: AgentSignal | null
  suggestedQuestions: string[] | null
  profileUpdate: Partial<AiProfile> | null
}
