import React from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { Platform, View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabNavigationOptions, MaterialTopTabNavigationEventMap } from '@react-navigation/material-top-tabs';
import { withLayoutContext, useRouter } from 'expo-router';
import { TabNavigationState, ParamListBase, TabActions } from '@react-navigation/native';
import { useAuthStore } from '@/src/store/authStore';

const { Navigator } = createMaterialTopTabNavigator();

export const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

function CustomTabBar({ state, descriptors, navigation, router }: any) {
  const { user } = useAuthStore();
  const isAnonymous = user?.isAnonymousMode;

  const bottomTabs = isAnonymous ? [
    { name: 'index', icon: 'flash', outline: 'flash-outline', label: 'FEED', lib: 'Ionicons' },
    { name: 'messages', icon: 'chatbubble-ellipses', outline: 'chatbubble-ellipses-outline', label: 'CHAT', lib: 'Ionicons' },
    { name: 'shots', icon: 'search', outline: 'search-outline', label: 'SEARCH', lib: 'Ionicons' },
    { name: 'profile', icon: 'ghost', outline: 'ghost-outline', label: 'PROFILE', lib: 'MaterialCommunityIcons' },
  ] : [
    { name: 'index', icon: 'home', outline: 'home-outline', label: 'Home', lib: 'Ionicons' },
    { name: 'messages', icon: 'chatbubbles', outline: 'chatbubbles-outline', label: 'Chat', lib: 'Ionicons' },
    { name: 'shots', icon: 'play-circle', outline: 'play-circle-outline', label: 'Shots', lib: 'Ionicons' },
    { name: 'profile', icon: 'person', outline: 'person-outline', label: 'Profile', lib: 'Ionicons' },
  ];

  const handleTabPress = (tabName: string) => {
    navigation.dispatch(TabActions.jumpTo(tabName));
  };

  const activeColor = isAnonymous ? '#FFF' : COLORS.secondary;
  const inactiveColor = isAnonymous ? '#333' : COLORS.subtitle;
  const bgColor = isAnonymous ? '#000' : COLORS.white;

  const currentRouteName = state.routes[state.index]?.name;
  if (currentRouteName === 'shots') return null;

  return (
    <View style={[styles.tabBarContainer, { backgroundColor: bgColor, borderTopColor: isAnonymous ? '#1A1A1A' : COLORS.border + '30' }]}>
      <View style={styles.tabBar}>
        {bottomTabs.map((tab: any) => {
          const currentRouteName = state.routes[state.index]?.name;
          const isFocused = currentRouteName === tab.name;
          const IconLib = tab.lib === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;

          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => handleTabPress(tab.name)}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <IconLib
                name={(isFocused ? tab.icon : tab.outline) as any}
                size={26}
                color={isFocused ? activeColor : inactiveColor}
              />
              <Text style={{ 
                color: isFocused ? activeColor : inactiveColor, 
                fontSize: 9, 
                fontWeight: '900', 
                marginTop: 4,
                letterSpacing: isAnonymous ? 1 : 0
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { user } = useAuthStore();
  const router = useRouter(); // For the push action

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <MaterialTopTabs
        tabBarPosition="bottom"
        tabBar={(props) => <CustomTabBar {...props} router={router} />}
        initialRouteName="index"
        screenOptions={{
          tabBarActiveTintColor: COLORS.secondary,
          tabBarInactiveTintColor: COLORS.subtitle,
          tabBarShowLabel: false,
          tabBarIndicatorStyle: { height: 0 },
          tabBarPressColor: 'transparent',
          animationEnabled: false,
          swipeEnabled: true,
        }}>
        <MaterialTopTabs.Screen name="index" options={{ title: 'Home' }} />
        <MaterialTopTabs.Screen name="messages" options={{ title: 'Messages' }} />
        <MaterialTopTabs.Screen name="shots" options={{ title: 'Shots' }} />
        <MaterialTopTabs.Screen name="profile" options={{ title: 'Profile' }} />
      </MaterialTopTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    height: Platform.OS === 'ios' ? 100 : 75,
    paddingBottom: Platform.OS === 'ios' ? 30 : 15,
    zIndex: 99999,
  },
  tabBar: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    zIndex: 100000,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 100001,
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
  }
});
