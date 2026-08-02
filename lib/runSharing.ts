import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/**
 * 共有カードを画像化してOS共有シートを開く。
 * iOSは画像と文面を同時に渡し、Androidは画像共有、非対応環境は文面共有へフォールバックする。
 */
export async function shareRunResult(
  target: View | null,
  message: string,
  dialogTitle: string,
): Promise<void> {
  if (target) {
    try {
      const uri = await captureRef(target, { format: 'png', quality: 0.92 });
      if (Platform.OS === 'ios') {
        await Share.share({ url: uri, message }, { subject: dialogTitle });
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
        return;
      }
    } catch (error) {
      console.warn('[RunSharing] image share failed, falling back to text share:', error);
    }
  }

  await Share.share({ message }, { dialogTitle });
}
