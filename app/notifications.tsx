import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator,
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
import { Colors, BorderRadius } from '../design_tokens';
import { EmptyState } from '../components/ui/EmptyState';

function notificationIcon(type: NotificationType): { name: any; color: string } {
  switch (type) {
    case 'rank_change':     return { name: 'trending-up-outline', color: Colors.info };
    case 'battle_end_soon': return { name: 'timer-outline', color: Colors.accent };
    case 'title_earned':    return { name: 'ribbon-outline', color: Colors.accentYellow };
    case 'battle_ended':    return { name: 'flag-outline', color: Colors.textSecondary };
    case 'reaction':        return { name: 'heart-outline', color: Colors.error };
    default:                return { name: 'notifications-outline', color: Colors.textTertiary };
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
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
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
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="通知はありません"
          hint="バトルに参加すると通知が届きます"
        />
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
                  <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
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
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  unreadBadge: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unreadBadgeText: { fontSize: 11, color: Colors.textOnPrimary, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  list: { paddingVertical: 8 },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 70 },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
  },
  itemUnread: { backgroundColor: Colors.primaryLight },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemBody: { flex: 1, gap: 2 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  itemTitleUnread: { color: Colors.textPrimary, fontWeight: '800' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent,
    flexShrink: 0,
  },
  itemText: { fontSize: 12, color: Colors.textTertiary, lineHeight: 17 },
  itemTime: { fontSize: 10, color: Colors.textTertiary, marginTop: 2, fontWeight: '600' },
});
