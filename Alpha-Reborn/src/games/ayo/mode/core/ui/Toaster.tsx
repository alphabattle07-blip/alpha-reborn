import { useState } from 'react';
import { ToastAndroid } from 'react-native';

export const useToast = () => {
  const toast = ({ title, description }: { title: string; description: string }) => {
    ToastAndroid.showWithGravity(`${title}: ${description}`, ToastAndroid.LONG, ToastAndroid.TOP);
  };
  return { toast };
};
