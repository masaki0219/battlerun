import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '../../stores/authStore';
import { useRecordStore } from '../../stores/recordStore';
import { useLocation } from '../../hooks/useLocation';
import '../../lib/locationTask';
import { useStepCounter } from '../../hooks/useStepCounter';

const PRIMARY = '#00D9A3';
const ACCENT  = '#FF5C2B';
const INK     = '#0A0E1A';
const INK3    = '#9AA4B5';
const LINE    = 'rgba(10,14,26,0.08)';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ITEMS: {
  name: string;
  label: string;
  icon: IconName;
  iconFocused?: IconName;
  primary?: boolean;
}[] = [
  { name: 'battle',  label: 'バトル',       icon: 'trophy-outline',    iconFocused: 'trophy' },
  { name: 'record',  label: 'ラン',         icon: 'walk-outline',      primary: true },
  { name: 'stats',   label: '記録',         icon: 'bar-chart-outline', iconFocused: 'bar-chart' },
  { name: 'profile', label: 'プロフィール', icon: 'person-outline',    iconFocused: 'person' },
];

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[tb.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const item = TAB_ITEMS.find((t) => t.name === route.name);
        if (!item) return null;
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (item.primary) {
          return (
            <View key={route.key} style={tb.centerWrap}>
              <TouchableOpacity style={tb.centerBtn} onPress={onPress} activeOpacity={0.8}>
                <Ionicons name="walk-outline" size={26} color="#fff" />
              </TouchableOpacity>
              <Text style={[tb.label, { color: INK, fontWeight: '700' }]}>{item.label}</Text>
            </View>
          );
        }

        const color = focused ? PRIMARY : INK3;
        const iconName = focused ? (item.iconFocused ?? item.icon) : item.icon;

        return (
          <TouchableOpacity key={route.key} style={tb.tab} onPress={onPress} activeOpacity={0.7}>
            <Ionicons name={iconName} size={22} color={color} />
            <Text style={[tb.label, { color, fontWeight: focused ? '700' : '500' }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 10,
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    marginTop: -22,
    gap: 3,
  },
  centerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
});

export default function TabLayout() {
  const { user, isLoading } = useAuthStore();
  const isRecording = useRecordStore((s) => s.isRecording);
  const measurementType = useRecordStore((s) => s.measurementType);

  useLocation({ enabled: isRecording });
  useStepCounter({ enabled: isRecording && measurementType === 'steps' });

  if (isLoading || !user) {
    return <View style={{ flex: 1, backgroundColor: '#F4F2EC' }} />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="battle" />
      <Tabs.Screen name="record" />
      <Tabs.Screen name="stats" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
