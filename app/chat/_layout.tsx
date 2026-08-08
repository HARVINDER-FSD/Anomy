import { Stack } from 'expo-router';
import React from 'react';

export default function ChatStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'simple_push',
      }}
    />
  );
}
