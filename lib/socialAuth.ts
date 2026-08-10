import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  OAuthProvider,
  type AuthCredential,
  type UserCredential,
  signInWithCredential,
} from 'firebase/auth';
import { auth } from './firebase';

export type SocialProviderId = 'apple.com' | 'google.com';

export interface SocialCredentialBundle {
  credential: AuthCredential;
  providerId: SocialProviderId;
  email: string | null;
  suggestedName: string | null;
  /** Appleの削除時にFirebase iOS SDKへ渡す短命な認可コード。永続化しない。 */
  appleAuthorizationCode?: string;
  /** Googleの接続解除に使う安定ID。永続化しない。 */
  googleAccountId?: string;
}

export interface PendingAccountLink extends SocialCredentialBundle {
  createdAtMs: number;
}

export interface SocialSignInResult {
  status: 'signed-in' | 'link-required';
  userCredential?: UserCredential;
}

const PENDING_LINK_MAX_AGE_MS = 10 * 60 * 1000;
let pendingAccountLink: PendingAccountLink | null = null;
let configuredGoogleClientId: string | null = null;

export class SocialAuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SocialAuthError';
  }
}

export function isNativeAuthBuild(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android')
    && Constants.appOwnership !== 'expo';
}

function requireGoogleSignIn(): typeof import('react-native-nitro-google-signin') {
  if (!isNativeAuthBuild()) {
    throw new SocialAuthError(
      'social/native-build-required',
      'Apple／Googleログインは開発ビルドまたはストア版で利用できます。',
    );
  }
  // Expo Goにはこのネイティブモジュールが無いため、対応ビルドでだけ遅延ロードする。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-nitro-google-signin') as typeof import('react-native-nitro-google-signin');
}

export function configureGoogleSignIn(): typeof import('react-native-nitro-google-signin') {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId || !webClientId.endsWith('.apps.googleusercontent.com')) {
    throw new SocialAuthError(
      'social/google-not-configured',
      'Googleログインの設定が不足しています。サポートへお問い合わせください。',
    );
  }
  const google = requireGoogleSignIn();
  if (configuredGoogleClientId !== webClientId) {
    google.GoogleOneTapSignIn.configure({
      webClientId,
      offlineAccess: false,
      autoSelectOnSignIn: false,
    });
    configuredGoogleClientId = webClientId;
  }
  return google;
}

export function googleCredentialBundle(
  data: import('react-native-nitro-google-signin').OneTapSuccessData,
): SocialCredentialBundle {
  if (!data.idToken) {
    throw new SocialAuthError(
      'social/google-missing-id-token',
      'Googleから認証情報を取得できませんでした。もう一度お試しください。',
    );
  }
  return {
    credential: GoogleAuthProvider.credential(data.idToken),
    providerId: 'google.com',
    email: data.user.email,
    suggestedName: data.user.name,
    googleAccountId: data.user.id,
  };
}

export async function requestGoogleCredential(): Promise<SocialCredentialBundle> {
  const google = configureGoogleSignIn();
  await google.GoogleOneTapSignIn.checkPlayServices(true);
  const response = await google.GoogleOneTapSignIn.presentExplicitSignIn();
  if (!google.isSuccessResponse(response)) {
    throw new SocialAuthError('social/cancelled', 'Googleログインをキャンセルしました。');
  }
  return googleCredentialBundle(response.data);
}

export async function requestAppleCredential(): Promise<SocialCredentialBundle> {
  if (Platform.OS !== 'ios' || !isNativeAuthBuild() || !(await AppleAuthentication.isAvailableAsync())) {
    throw new SocialAuthError(
      'social/apple-unavailable',
      'AppleでサインインはiPhone／iPadの開発ビルドまたはストア版で利用できます。',
    );
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  const state = Crypto.randomUUID();
  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
    state,
  });

  if (appleCredential.state !== state) {
    throw new SocialAuthError(
      'social/apple-invalid-state',
      'Appleログインの応答を確認できませんでした。もう一度お試しください。',
    );
  }
  if (!appleCredential.identityToken) {
    throw new SocialAuthError(
      'social/apple-missing-id-token',
      'Appleから認証情報を取得できませんでした。もう一度お試しください。',
    );
  }

  const provider = new OAuthProvider('apple.com');
  const formattedName = appleCredential.fullName
    ? AppleAuthentication.formatFullName(appleCredential.fullName).trim()
    : '';
  return {
    credential: provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce,
    }),
    providerId: 'apple.com',
    email: appleCredential.email,
    suggestedName: formattedName || null,
    appleAuthorizationCode: appleCredential.authorizationCode ?? undefined,
  };
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : null;
}

function accountCollisionEmail(error: unknown, fallback: string | null): string | null {
  const customData = (error as { customData?: { email?: unknown } })?.customData;
  return typeof customData?.email === 'string' ? customData.email : fallback;
}

export async function signInWithSocialCredential(
  bundle: SocialCredentialBundle,
): Promise<SocialSignInResult> {
  try {
    const userCredential = await signInWithCredential(auth, bundle.credential);
    clearPendingAccountLink();
    return { status: 'signed-in', userCredential };
  } catch (error) {
    if (errorCode(error) !== 'auth/account-exists-with-different-credential') throw error;
    pendingAccountLink = {
      ...bundle,
      email: accountCollisionEmail(error, bundle.email),
      createdAtMs: Date.now(),
    };
    return { status: 'link-required' };
  }
}

export function getPendingAccountLink(): PendingAccountLink | null {
  if (pendingAccountLink && Date.now() - pendingAccountLink.createdAtMs > PENDING_LINK_MAX_AGE_MS) {
    pendingAccountLink = null;
  }
  return pendingAccountLink;
}

export function clearPendingAccountLink(): void {
  pendingAccountLink = null;
}

export function socialAuthErrorMessage(error: unknown): string | null {
  const code = errorCode(error);
  if (code === 'ERR_REQUEST_CANCELED' || code === 'SIGN_IN_CANCELLED' || code === 'social/cancelled') {
    return null;
  }
  if (error instanceof SocialAuthError) return error.message;
  if (code === 'DEVELOPER_ERROR') {
    return 'Googleログインの署名設定を確認できませんでした。アプリを最新版へ更新しても解決しない場合はサポートへお問い合わせください。';
  }
  if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
    return 'Google Play開発者サービスを更新して、もう一度お試しください。';
  }
  if (code === 'auth/credential-already-in-use') {
    return 'このログイン方法は別のZELIOアカウントに連携されています。';
  }
  if (code === 'auth/user-mismatch') {
    return '現在のアカウントと異なる認証情報です。正しいアカウントを選んでください。';
  }
  return '認証できませんでした。通信状態を確認して、もう一度お試しください。';
}

export async function signOutGoogleSession(): Promise<void> {
  if (!isNativeAuthBuild()) return;
  try {
    const google = configureGoogleSignIn();
    await google.GoogleOneTapSignIn.signOut();
  } catch (error) {
    console.warn('[Auth] Googleの端末セッションを解除できませんでした:', error);
  }
}

export async function revokeGoogleAccess(accountIdOrEmail: string): Promise<void> {
  const google = configureGoogleSignIn();
  await google.GoogleOneTapSignIn.revokeAccess(accountIdOrEmail);
}

export async function revokeAppleAuthorizationCode(authorizationCode: string): Promise<void> {
  if (Platform.OS !== 'ios' || !isNativeAuthBuild()) {
    throw new SocialAuthError(
      'social/apple-revoke-unavailable',
      'Apple認証を連携したアカウントは、iPhone／iPadの開発ビルドまたはストア版から削除してください。',
    );
  }
  // Firebase JS SDKのrevokeAccessTokenはApple OAuth access token用。
  // ExpoのApple APIが返すauthorizationCodeはFirebase iOS SDKへ渡す必要がある。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nativeAuth = require('@react-native-firebase/auth') as typeof import('@react-native-firebase/auth');
  await nativeAuth.revokeToken(nativeAuth.getAuth(), authorizationCode);
}
