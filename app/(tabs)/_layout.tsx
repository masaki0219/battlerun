import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { useRecordStore } from '../../stores/recordStore';
import { useLocation } from '../../hooks/useLocation';
import '../../lib/locationTask'; // バックグラウンドタスクをアプリ起動時に登録
import { useStepCounter } from '../../hooks/useStepCounter';
import { Colors, TabBar } from '../../design_tokens';

export default function TabLayout() {
  const { user, isLoading } = useAuthStore();
  const isRecording = useRecordStore((s) => s.isRecording);
  const measurementType = useRecordStore((s) => s.measurementType);

  // タブ全体の親で呼ぶ → どのタブに居ても計測が止まらない
  useLocation({ enabled: isRecording });
  useStepCounter({ enabled: isRecording && measurementType === 'steps' });

  // 認証状態が確定するまで待つ（確定前にリダイレクトするとログインループが発生する）
  if (isLoading) return null;

  if (!user) {
    return <Redirect href="/auth/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TabBar.activeColor,
        tabBarInactiveTintColor: TabBar.inactiveColor,
        tabBarStyle: {
          backgroundColor: TabBar.backgroundColor,
          borderTopColor: TabBar.borderTopColor,
          borderTopWidth: 1,
          height: TabBar.height,
        },
        tabBarLabelStyle: {
          fontSize: TabBar.labelSize,
          marginBottom: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: '記録',
          tabBarIcon: ({ color }) => <Ionicons name="footsteps" size={TabBar.iconSize + 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="battle"
        options={{
          title: 'バトル',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'プロフィール',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
