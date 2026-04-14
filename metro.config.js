const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Setup required logic to resolve 'socket.io-client' and 'engine.io-client' properly in Expo
config.resolver.sourceExts.push('mjs', 'cjs');

module.exports = config;
