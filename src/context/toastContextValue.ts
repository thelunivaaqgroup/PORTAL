import { createContext } from "react";

export type ToastVariant = "success" | "error" | "info";

export type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
};

export type ToastContextValue = {
  toast: (variant: ToastVariant, message: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);
