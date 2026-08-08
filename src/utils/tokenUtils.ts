import AsyncStorage from '@react-native-async-storage/async-storage';

export const getAuthToken = async (): Promise<string | null> => {
  try {
    const t1 = await AsyncStorage.getItem('auth-token');
    if (t1) return t1;
    const t2 = await AsyncStorage.getItem('userToken');
    if (t2) return t2;
    return null;
  } catch {
    return null;
  }
};
