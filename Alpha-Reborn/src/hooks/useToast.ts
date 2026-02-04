import React, { createContext, useContext, useState, ReactNode } from "react";
import Toast from "react-native-toast-message";

type ToastType = "success" | "error" | "info";

interface ToastOptions {
  title?: string;
  description?: string;
  type?: ToastType;
}

interface ToastContextType {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const toast = ({ title, description, type = "info" }: ToastOptions) => {
    Toast.show({
      type,
      text1: title,
      text2: description,
      position: "top",
      visibilityTime: 3000,
    });
  };

  return React.createElement(
    ToastContext.Provider,
    { value: { toast } },
    children,
    React.createElement(Toast, {})
  );
};

export const useToast = () => useContext(ToastContext);
