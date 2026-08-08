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

  const bottomTabs = isAnonymous ? [
    { name: 'index', icon: 'home', outline: 'home-outline', label: 'Home', lib: 'Ionicons' },
    { name: 'explore', icon: 'search', outline: 'search-outline', label: 'Search', lib: 'Ionicons' },
    { name: 'messages', icon: 'chatbubble', outline: 'chatbubble-outline', label: 'Chat', lib: 'Ionicons' },
    { name: 'profile', icon: 'person', outline: 'person-outline', label: 'Profile', lib: 'Ionicons' },
  ] : [
    { name: 'index', icon: 'home', outline: 'home-outline', label: 'Home', lib: 'Ionicons' },
    { name: 'shots', icon: 'play-circle', outline: 'play-circle-outline', label: 'Shots', lib: 'Ionicons' },
    { name: 'messages', icon: 'chatbubble', outline: 'chatbubble-outline', label: 'Chat', lib: 'Ionicons' },
    { name: 'profile', icon: 'person', outline: 'person-outline', label: 'Profile', lib: 'Ionicons' },
  ];

  const handleTabPress = (tabName: string) => {
    setAnimationEnabled(false);
    navigation.dispatch(TabActions.jumpTo(tabName));
    setTimeout(() => {
      setAnimationEnabled(true);
    }, 100);
  };

  const isShots = currentRoute === 'shots';
  const activeColor = isShots ? '#FFF' : COLORS.secondary;
  const inactiveColor = isShots ? 'rgba(255,255,255,0.5)' : COLORS.subtitle;
  const bgColor = isShots ? '#000000' : COLORS.white;

  return (
    <View style={[styles.tabBarContainer, { backgroundColor: bgColor }]}>
      <View style={[styles.tabBar, { backgroundColor: bgColor, borderTopColor: isShots ? 'rgba(255,255,255,0.15)' : (isAnonymous ? '#F0F0F0' : COLORS.border) }]}>
        {bottomTabs.map((tab: any) => {
          const isFocused = state.routes[state.index]?.name === tab.name;
          const IconLib = tab.lib === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;

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
                    source={{ uri: resolveAvatarUrl(tab.name === 'profile' && isAnonymous ? (user as any)?.anonymousPersona?.avatar : user?.avatar_url || user?.avatar, user?.username, isAnonymous) }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      opacity: isFocused ? 1 : 0.8,
                    }}
                  />
                </View>
              ) : (
                <View>
                  <IconLib
                    name={(isFocused ? tab.icon : tab.outline) as any}
                    size={tab.name === 'shots' ? 32 : 26}
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
  const { user } = useAuthStore();
  const isAnonymous = !!user?.isAnonymousMode;
  const router = useSafeRouter();
  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount);
  const fetchUnreadNotificationsCount = useNotificationStore((s) => s.fetchUnreadNotificationsCount);
  const [animationEnabled, setAnimationEnabled] = React.useState(true);
  const navigationRef = React.useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      void fetchUnreadCount();
      void fetchUnreadNotificationsCount();
    }
  }, [user?.id, fetchUnreadCount, fetchUnreadNotificationsCount]);

  // Smart route preservation on mode switch
  const prevAnonRef = React.useRef(isAnonymous);
  useEffect(() => {
    if (prevAnonRef.current !== isAnonymous) {
      prevAnonRef.current = isAnonymous;
      const doJump = () => {
        if (navigationRef.current) {
          try {
            const state = navigationRef.current.getState();
            const currentRouteName = state?.routes[state?.index]?.name;
            
            let targetRoute = currentRouteName;
            if (isAnonymous && currentRouteName === 'shots') {
              targetRoute = 'index';
            } else if (!isAnonymous && currentRouteName === 'explore') {
              targetRoute = 'index';
            }
            if (!targetRoute) targetRoute = 'profile';

            navigationRef.current.dispatch(TabActions.jumpTo(targetRoute));
          } catch (_) {
            try {
              navigationRef.current.dispatch(TabActions.jumpTo('profile'));
            } catch (__) {}
          }
        }
      };
      doJump();
      setTimeout(doJump, 50);
    }
  }, [isAnonymous]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <MaterialTopTabs
        key={isAnonymous ? 'anon-tabs' : 'normal-tabs'}
        ref={navigationRef}
        tabBarPosition="bottom"
        tabBar={(props) => <CustomTabBar {...props} router={router} setAnimationEnabled={setAnimationEnabled} />}
        initialRouteName="index"
        screenOptions={{
          tabBarActiveTintColor: COLORS.secondary,
          tabBarInactiveTintColor: COLORS.subtitle,
          tabBarShowLabel: false,
          tabBarIndicatorStyle: { height: 0 },
          tabBarPressColor: 'transparent',
          animationEnabled: animationEnabled,
          swipeEnabled: true,
          lazy: false,
        }}>
        {/* ✅ NORMAL MODE: Create (Left of Home) ↔ Home ↔ Shots ↔ Messages ↔ Profile */}
        {/* ✅ ANONYMOUS MODE: Feed ↔ Search ↔ Messages ↔ Profile (Shots & Create 100% Disabled/Hidden) */}
        {!isAnonymous ? [
          <MaterialTopTabs.Screen key="explore" name="explore" options={{ tabBarItemStyle: { display: 'none' }, swipeEnabled: false }} />,
          <MaterialTopTabs.Screen key="create" name="create" options={{ title: 'Create', tabBarItemStyle: { display: 'none' }, swipeEnabled: true }} />,
          <MaterialTopTabs.Screen key="index" name="index" options={{ title: 'Home' }} />,
          <MaterialTopTabs.Screen key="shots" name="shots" options={{ title: 'Shots' }} />,
          <MaterialTopTabs.Screen key="messages" name="messages" options={{ title: 'Messages', lazy: false }} />,
          <MaterialTopTabs.Screen key="profile" name="profile" options={{ title: 'Profile' }} />,
        ] : [
          <MaterialTopTabs.Screen key="shots" name="shots" options={{ tabBarItemStyle: { display: 'none' }, swipeEnabled: false }} />,
          <MaterialTopTabs.Screen key="create" name="create" options={{ tabBarItemStyle: { display: 'none' }, swipeEnabled: false }} />,
          <MaterialTopTabs.Screen key="index" name="index" options={{ title: 'Feed' }} />,
          <MaterialTopTabs.Screen key="explore" name="explore" options={{ title: 'Search' }} />,
          <MaterialTopTabs.Screen key="messages" name="messages" options={{ title: 'Messages', lazy: false }} />,
          <MaterialTopTabs.Screen key="profile" name="profile" options={{ title: 'Profile' }} />,
        ]}
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
