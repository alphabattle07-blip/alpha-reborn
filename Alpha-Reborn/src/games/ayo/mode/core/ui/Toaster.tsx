import { useState } from 'react';
import { ToastAndroid } from 'react-native';

export const useToast = () => {
  const toast = ({ title, description }: { title: string; description: string }) => {
    ToastAndroid.showWithGravity(`${title}: ${description}`, ToastAndroid.LONG, ToastAndroid.TOP);
  };
  return { toast };
};
// Tap seed → applyMove locally (instant animation) → emit to server → server confirms → rubber-banding clears pending state
// Tap → dice starts spinning instantly → emit ROLL_DICE → server result arrives → dice settles on final value
