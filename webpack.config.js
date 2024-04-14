const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

const { version } = require('./package.json');

const minimize = true;

module.exports = {
  mode: 'production',
  performance: {
    maxEntrypointSize: 1e10,
    maxAssetSize: 1e10,
  },
  optimization: {
    minimize: minimize,
  },
  module: {
    rules: [
      {
        test: /\.(css|xml|html)$/i,
        use: 'raw-loader',
      },
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new CopyPlugin({
      patterns: [
        { from: 'src/icons', to: 'icons' },
        { from: 'src/rules.json', to: 'rules.json' },
        {
          from: 'src/manifest.json',
          to: 'manifest.json',
          transform: (content) => {
            const jsonContent = JSON.parse(content);
            jsonContent.version = version.replace(/-.+/, '');

            return JSON.stringify(jsonContent, null, 2);
          },
        },
      ],
    }),
  ],
  resolve: {
    extensions: ['.ts', '.js'],
  },
  entry: {
    'js/manifoldClientInjector': './src/inject/manifoldClientInjector.js',
    'css/style': './src/dom/style.css',
    'js/loadInjector': './src/inject/loadInjector.js',
    'js/runInjectors': './src/inject/runInjectors.js',
  },
  output: {
    hashFunction: 'xxhash64',
    chunkFormat: 'array-push',
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
};
