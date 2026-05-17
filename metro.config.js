const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// React Native 向け Firebase ビルドを使用するために react-native export condition を追加
config.resolver.unstable_conditionNames = ['react-native', 'require', 'default'];

module.exports = config;
