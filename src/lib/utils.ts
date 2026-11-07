import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Supabase errors and thrown values both have a message; fall back to a generic one.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Something went wrong";
}

// "09:30:00" -> "09:30"
export function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

// Minutes since midnight for a "HH:MM[:SS]" time.
export function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}
