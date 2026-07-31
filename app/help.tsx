import React from 'react';
import { LegalDocument } from '../components/legal/LegalDocument';
import { FeedbackForm } from '../components/feedback/FeedbackForm';
import { SUPPORT_CONTACT_URL } from '../lib/legal';
import { isFeedbackConfigured } from '../lib/feedback';

export default function HelpScreen() {
  return <LegalDocument
    title="ヘルプ・お問い合わせ"
    updatedAt="2026年7月31日"
    topContent={isFeedbackConfigured() ? <FeedbackForm /> : undefined}
    sections={[
    { heading: '記録が増えない', body: 'GPSモードでは位置情報を許可し、空が見える場所で開始してください。歩数モードは端末のモーションセンサー対応が必要です。通信できない場合も記録は端末に保管され、次回オンライン時に再送されます。' },
    { heading: 'バックグラウンド記録', body: '位置情報を「常に許可」にすると記録中のバックグラウンド計測が利用できます。端末の省電力設定や強制終了により更新が止まる場合があります。警告が表示された場合は画面を開いたまま利用してください。' },
    { heading: '購入の復元・解約', body: 'プロフィールの「購入を復元する」を利用してください。解約や支払い方法の変更はApp Storeのサブスクリプション設定から行えます。' },
    { heading: '不適切な記録や表示', body: 'ランキングへ反映されない場合は、異常な速度・時刻・距離として保留された可能性があります。アプリを再起動しても解決しない場合は、発生日時と画面名を添えてお問い合わせください。' },
    { heading: '安全に関する通報・ブロック', body: '他の利用者の宣言、走行中表示、公開記録、チャレンジで不適切な内容を見つけた場合は、対象付近の「…」から理由を選んで通報してください。同じ画面でユーザーをブロックできます。ブロック後は相手の投稿等が非表示になり、相互の応援・リアクション・関連通知も停止します。解除はプロフィールの「ブロック中のユーザー」から行えます。運営は原則24時間以内に通報の確認を開始します。' },
    { heading: 'お問い合わせ窓口', body: '返信が必要な不具合の報告は、ZELIOサポートのGitHub Issuesで受け付けています。アカウントのパスワードやGPSルートなどの秘密情報は投稿しないでください。', action: { label: 'ZELIOサポートへ問い合わせる', url: SUPPORT_CONTACT_URL } },
    { heading: '緊急時', body: 'ZELIOは医療・救命サービスではありません。体調不良や事故の場合は、周囲の安全を確保して地域の緊急窓口へ連絡してください。' },
  ]} />;
}
