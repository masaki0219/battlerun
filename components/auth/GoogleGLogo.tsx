import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../design_tokens';

/** Googleの公式4色を保った、表示専用のGマーク。 */
export function GoogleGLogo() {
  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 18 18"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Path
        fill={Colors.googleLogoBlue}
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.715v2.258h2.909c1.702-1.567 2.683-3.874 2.683-6.613Z"
      />
      <Path
        fill={Colors.googleLogoGreen}
        d="M9 18c2.43 0 4.468-.806 5.957-2.182l-2.909-2.258c-.806.54-1.836.859-3.048.859-2.344 0-4.329-1.585-5.037-3.714H.956v2.333A9 9 0 0 0 9 18Z"
      />
      <Path
        fill={Colors.googleLogoYellow}
        d="M3.963 10.705A5.42 5.42 0 0 1 3.682 9c0-.592.102-1.167.281-1.705V4.962H.956A9 9 0 0 0 0 9c0 1.45.347 2.824.956 4.038l3.007-2.333Z"
      />
      <Path
        fill={Colors.googleLogoRed}
        d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.582-2.582C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.333C4.67 5.166 6.656 3.58 9 3.58Z"
      />
    </Svg>
  );
}
