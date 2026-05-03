const path = require('path');
const fs = require('fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

// In a git worktree, node_modules is typically a symlink up to the main
// checkout. Metro's resolver doesn't reliably traverse that symlink, so add
// the symlink's realpath as an explicit search root.
const localNodeModules = path.join(__dirname, 'node_modules');
const realNodeModules = fs.existsSync(localNodeModules)
  ? fs.realpathSync(localNodeModules)
  : localNodeModules;

const config = {
  resolver: {
    nodeModulesPaths: [realNodeModules],
  },
  watchFolders: [realNodeModules],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
