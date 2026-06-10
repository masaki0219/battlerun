import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, query, orderBy, limit,
  getDocs, writeBatch, doc, where,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import type { AppNotification, NotificationType } from '../types';

const BR = {
  light:       '#F4F2EC',
  lightSurf2:  '#EDEAE2',
  ink:         '#0A0E1A',
  ink2:        '#5A6477',
  ink3:        '#9AA4B5',
  primary:     '#00D9A3',
  accent:      '#FF5C2B',
  gold:        '#FFC23C',
  paper:       '#FFFFFF',
  border:      'rgba(10,14,26,0.08)',
};

function Tac({ children, color = BR.ink3, size = 9 }: {
  children: string; color?: string; size?: number;
}) {
  return (
    <Text style={{
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      fontSize: size, fontWeight: '700',
      letterSpacing: size * 0.2, color,
      textTransform: 'uppercase',
    }}>{children}</Text>
  );
}

function notificationIcon(type: NotificationType): { name: any; color: string } {
  switch (type) {
    case 'rank_change':     return { name: 'trending-up-outline', color: '#3A86FF' };
    case 'battle_end_soon': return { name: 'timer-outline', color: BR.accent };
    case 'title_earned':    return { name: 'ribbon-outline', color: BR.gold };
    case 'battle_ended':    return { name: 'flag-outline', color: BR.ink2 };
    case 'reaction':        return { name: 'heart-outline', color: '#FF4757' };
    default:                return { name: 'notifications-outline', color: BR.ink3 };
  }
}

function agoLabel(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'たった今';
  if (diff < 60) return `${diff}分前`;
  if (diff < 1440) return `${Math.floor(diff / 60)}時間前`;
  return `${Math.floor(diff / 1440)}日前`;
}

export default function NotificationsScreen() {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users', user.id, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      const items: AppNotification[] = snap.docs.map((d) => ({
        id: d.id,
        type: d.data()['type'] as NotificationType,
        title: d.data()['title'] as string,
        body: d.data()['body'] as string,
        isRead: (d.data()['isRead'] as boolean) ?? false,
        relatedBattleId: d.data()['relatedBattleId'] as string | undefined,
        relatedActivityId: d.data()['relatedActivityId'] as string | undefined,
        createdAt: d.data()['createdAt']?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      }));
      setNotifications(items);

      // 未読を一括既読にする
      const unread = snap.docs.filter((d) => !d.data()['isRead']);
      if (unread.length > 0) {
        const batch = writeBatch(db);
        unread.forEach((d) => batch.update(d.ref, { isRead: true }));
        await batch.commit();
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  function handleTap(n: AppNotification) {
    if (n.relatedBattleId) {
      router.push(`/battle/${n.relatedBattleId}` as any);
    } else if (n.relatedActivityId) {
      router.push(`/activity/${n.relatedActivityId}` as any);
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={s.backBtn}
        >
          <Ionicons name="chevron-back" size={20} color={BR.ink2} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Tac color={BR.ink3} size={9}>BATTLERUN / 通知</Tac>
          <Text style={s.headerTitle}>通知センター</Text>
        </View>
        {unreadCount > 0 && (
          <View style={s.unreadBadge}>
            <Text style={s.unreadBadgeText}>{unreadCount}件未読</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={BR.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="notifications-off-outline" size={48} color={BR.ink3} />
          <Text style={s.emptyText}>通知はありません</Text>
          <Text style={s.emptySubText}>バトルに参加すると通知が届きます</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          renderItem={({ item }) => {
            const { name: iconName, color: iconColor } = notificationIcon(item.type);
            const isLinkable = !!item.relatedBattleId || !!item.relatedActivityId;
            return (
              <TouchableOpacity
                style={[s.item, !item.isRead && s.itemUnread]}
                onPress={() => handleTap(item)}
                disabled={!isLinkable}
                activeOpacity={isLinkable ? 0.7 : 1}
              >
                <View style={[s.iconWrap, { backgroundColor: `${iconColor}18` }]}>
                  <Ionicons name={iconName} size={20} color={iconColor} />
                </View>
                <View style={s.itemBody}>
                  <View style={s.itemTopRow}>
                    <Text style={[s.itemTitle, !item.isRead && s.itemTitleUnread]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {!item.isRead && <View style={s.dot} />}
                  </View>
                  <Text style={s.itemText} numberOfLines={2}>{item.body}</Text>
                  <Text style={s.itemTime}>{agoLabel(item.createdAt)}</Text>
                </View>
                {isLinkable && (
                  <Ionicons name="chevron-forward" size={14} color={BR.ink3} />
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

/** 通知をFirestoreに書き込むユーティリティ（クライアントサイド用） */
export async function createNotification(params: {
  userId: string;
  type: AppNotification['type'];
  title: string;
  body: string;
  relatedBattleId?: string;
  relatedActivityId?: string;
}): Promise<void> {
  const { userId, ...rest } = params;
  try {
    const { addDoc, serverTimestamp } = await import('firebase/firestore');
    await addDoc(collection(db, 'users', userId, 'notifications'), {
      ...rest,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch {
    // 通知の失敗はサイレントに処理
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BR.light },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BR.paper,
    borderBottomWidth: 1,
    borderBottomColor: BR.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: BR.ink, marginTop: 2 },
  unreadBadge: {
    backgroundColor: BR.accent,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unreadBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, fontWeight: '700', color: BR.ink2, marginTop: 4 },
  emptySubText: { fontSize: 12, color: BR.ink3 },

  list: { paddingVertical: 8 },
  separator: { height: 1, backgroundColor: BR.border, marginLeft: 70 },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: BR.paper,
  },
  itemUnread: { backgroundColor: '#F0FBF8' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemBody: { flex: 1, gap: 2 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: BR.ink2 },
  itemTitleUnread: { color: BR.ink, fontWeight: '800' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: BR.accent,
    flexShrink: 0,
  },
  itemText: { fontSize: 12, color: BR.ink3, lineHeight: 17 },
  itemTime: { fontSize: 10, color: BR.ink3, marginTop: 2, fontWeight: '600' },
});
