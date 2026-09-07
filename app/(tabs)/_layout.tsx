import React, { useEffect } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MessageCircleDashed } from 'lucide-react-native';
import { useAppTheme } from '@/src/theme/colors';
import { Platform, View, TouchableOpacity, StyleSheet, Text, Image, Dimensions, useWindowDimensions } from 'react-native';
import { resolveAvatarUrl } from '@/src/utils/imageUtils';
import { createMaterialTopTabNavigator, MaterialTopTabNavigationOptions, MaterialTopTabNavigationEventMap } from '@react-navigation/material-top-tabs';
import { withLayoutContext, useRouter } from 'expo-router';
import { TabNavigationState, ParamListBase, TabActions } from '@react-navigation/native';
import { useAuthStore } from '@/src/store/authStore';
import { useNotificationStore } from '@/src/store/notificationStore';
import { useChatStore } from '@/src/store/chatStore';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


const { Navigator } = createMaterialTopTabNavigator();

export const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

function CustomTabBar({ state, descriptors, navigation, router, setAnimationEnabled }: any) {
  const currentRoute = state.routes[state.index]?.name;
  if (currentRoute === 'create') {
    return null;
  }
  const COLORS = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const styles = getStyles(COLORS, insets, windowWidth);
  const { user } = useAuthStore();
  const { unreadMessagesCount } = useNotificationStore();
  const conversations = useChatStore((s: any) => s.conversations) || [];
  const isAnonymous = user?.isAnonymousMode;
  const myId = (user?.id || user?._id)?.toString();

  const totalUnreadFromChats = React.useMemo(() => {
    if (!myId) return 0;
    return conversations.reduce((sum: number, c: any) => {
      const map = c?.unread_counts;
      const val = map ? map[myId] : c?.unread_count;
      const last = c?.last_message;
      const sId = (last?.sender_id?._id || last?.sender_id)?.toString?.();
      if (sId && sId !== myId && last?.status !== 'read') {
        return sum + Math.max(Number(val) || 1, 1);
      }
      return sum + (Number(val) || 0);
    }, 0);
  }, [conversations, myId]);

  const displayUnread = Math.max(unreadMessagesCount || 0, totalUnreadFromChats);

  const bottomTabs = [
    { name: 'index', icon: 'flame', outline: 'flame-outline', label: 'Vibes', lib: 'Ionicons' },
    { name: 'explore', icon: 'flash', outline: 'flash-outline', label: 'Match ⚡', lib: 'Ionicons' },
    { name: 'create', icon: 'add', outline: 'add', label: 'Drop', isCenterBtn: true, lib: 'Ionicons' },
    { name: 'messages', icon: 'chatbubbles', outline: 'chatbubbles-outline', label: 'Chats', lib: 'Ionicons' },
    { name: 'profile', icon: 'person', outline: 'person-outline', label: 'Persona', lib: 'Ionicons' },
  ];

  const handleTabPress = (tabName: string) => {
    setAnimationEnabled(false);
    navigation.dispatch(TabActions.jumpTo(tabName));
    setTimeout(() => {
      setAnimationEnabled(true);
    }, 100);
  };

  const activeColor = COLORS.primary;
  const inactiveColor = COLORS.subtitle;
  const bgColor = (COLORS as any).tabBarBg || COLORS.surface;
  const borderColor = (COLORS as any).tabBarBorder || COLORS.border;

  return (
    <View style={[styles.tabBarContainer, { backgroundColor: bgColor }]}>
      <View style={[styles.tabBar, { backgroundColor: bgColor, borderTopColor: borderColor }]}>
        {bottomTabs.map((tab: any) => {
          const isFocused = state.routes[state.index]?.name === tab.name;
          const IconLib = tab.lib === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;

          if (tab.isCenterBtn) {
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => handleTabPress(tab.name)}
                style={styles.centerTabItem}
                activeOpacity={0.8}
              >
                <View style={[styles.centerTabBtn, { backgroundColor: COLORS.primary, borderColor: bgColor }]}>
                  <Ionicons name="add" size={28} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => handleTabPress(tab.name)}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              {tab.name === 'profile' ? (
                <View style={{
                  padding: 2,
                  borderRadius: 18,
                  borderWidth: isFocused ? 1.5 : 0,
                  borderColor: isFocused ? activeColor : 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <Image
                    source={{ uri: resolveAvatarUrl((user as any)?.anonymousPersona?.avatar, user?.username, true) }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      opacity: isFocused ? 1 : 0.8,
                    }}
                  />
                </View>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <IconLib
                    name={(isFocused ? tab.icon : tab.outline) as any}
                    size={24}
                    color={isFocused ? activeColor : inactiveColor}
                  />
                  {tab.name === 'messages' && displayUnread > 0 && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>
                        {displayUnread > 9 ? '9+' : displayUnread}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const COLORS = useAppTheme();
  const router = useSafeRouter();
  const { user } = useAuthStore();
  const [animationEnabled, setAnimationEnabled] = React.useState(true);
  const navigationRef = React.useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      void useNotificationStore.getState().fetchUnreadCount();
      void useNotificationStore.getState().fetchUnreadNotificationsCount();
    }
  }, [user?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <MaterialTopTabs
        key="pure-anon-tabs"
        ref={navigationRef}
        tabBarPosition="bottom"
        tabBar={(props) => <CustomTabBar {...props} router={router} setAnimationEnabled={setAnimationEnabled} />}
        initialRouteName="index"
        screenOptions={{
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.subtitle,
          tabBarShowLabel: false,
          tabBarIndicatorStyle: { height: 0 },
          tabBarPressColor: 'transparent',
          animationEnabled: false,
          swipeEnabled: true,
          lazy: true,
        }}>
        <MaterialTopTabs.Screen key="index" name="index" options={{ title: 'Vibes' }} />
        <MaterialTopTabs.Screen key="explore" name="explore" options={{ title: 'Match ⚡' }} />
        <MaterialTopTabs.Screen key="create" name="create" options={{ title: 'Drop ➕' }} />
        <MaterialTopTabs.Screen key="messages" name="messages" options={{ title: 'Chats', lazy: false }} />
        <MaterialTopTabs.Screen key="profile" name="profile" options={{ title: 'Persona' }} />
        <MaterialTopTabs.Screen key="shots" name="shots" options={{ tabBarItemStyle: { display: 'none' }, swipeEnabled: false }} />
      </MaterialTopTabs>
    </View>
  );
}

const getStyles = (COLORS: any, insets: { bottom: number; left: number; right: number; top: number }, windowWidth: number = 375) => {
  const TAB_ICON_AREA = 52;
  // Cap safeBottom so no device gets massive empty spacing while remaining flush to the bottom edge
  const safeBottom = Platform.OS === 'ios' ? Math.min(insets.bottom, 20) : (insets.bottom > 0 ? Math.min(insets.bottom, 14) : 4);
  const totalHeight = TAB_ICON_AREA + safeBottom;

  return StyleSheet.create({
    tabBarContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      width: '100%',
      backgroundColor: COLORS.surface,
      zIndex: 10,
    },
    tabBar: {
      flexDirection: 'row',
      height: totalHeight,
      paddingBottom: safeBottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: COLORS.surface,
      width: '100%',
      borderRadius: 0,
      borderTopWidth: 0.5,
      borderWidth: 0,
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
      zIndex: 11,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: TAB_ICON_AREA,
      minWidth: 44,
      zIndex: 12,
    },
    centerTabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: TAB_ICON_AREA,
      minWidth: 44,
      zIndex: 13,
    },
    centerTabBtn: {
      width: 54,
      height: 54,
      borderRadius: 27,
      marginTop: -30,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 4,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
    },
    tabBadge: {
      position: 'absolute',
      top: -4,
      right: -8,
      backgroundColor: '#FF3B30',
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: '#FFF',
    },
    tabBadgeText: {
      color: '#FFF',
      fontSize: 9,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });
};
