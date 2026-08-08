import React from 'react';
import LottieView from 'lottie-react-native';

/** Small decorative Lottie in chat header. */
const MOOD_LOTTIE =
  'https://assets2.lottiefiles.com/packages/lf20_cbrbre30.json';

type Props = {
  size?: number;
};

export function ChatHeaderLottie({ size = 34 }: Props) {
  return (
    <LottieView
      source={{ uri: MOOD_LOTTIE }}
      autoPlay
      loop
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
