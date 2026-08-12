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
import { translate } from './translate';

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
      translate('auth.nativeBuildOnly'),
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
      translate('auth.googleNotConfigured'),
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
      translate('auth.googleMissingCredential'),
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
    throw new SocialAuthError('social/cancelled', translate('auth.googleCancelled'));
  }
  return googleCredentialBundle(response.data);
}

export async function requestAppleCredential(): Promise<SocialCredentialBundle> {
  if (Platform.OS !== 'ios' || !isNativeAuthBuild() || !(await AppleAuthentication.isAvailableAsync())) {
    throw new SocialAuthError(
      'social/apple-unavailable',
      translate('auth.appleUnavailable'),
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
      translate('auth.appleInvalidResponse'),
    );
  }
  if (!appleCredential.identityToken) {
    throw new SocialAuthError(
      'social/apple-missing-id-token',
      translate('auth.appleMissingCredential'),
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
    return translate('auth.googleSignature');
  }
  if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
    return translate('auth.playServices');
  }
  if (code === 'auth/credential-already-in-use') {
    return translate('auth.credentialLinkedElsewhere');
  }
  if (code === 'auth/user-mismatch') {
    return translate('auth.authMismatch');
  }
  return translate('auth.socialFailed');
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
      translate('auth.appleDeleteDevice'),
    );
  }
  // Firebase JS SDKのrevokeAccessTokenはApple OAuth access token用。
  // ExpoのApple APIが返すauthorizationCodeはFirebase iOS SDKへ渡す必要がある。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nativeAuth = require('@react-native-firebase/auth') as typeof import('@react-native-firebase/auth');
  await nativeAuth.revokeToken(nativeAuth.getAuth(), authorizationCode);
}
