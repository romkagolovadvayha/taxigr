const rustorePushEnabled = process.env.RUSTORE_PUSH_ENABLED === 'true';

module.exports = {
  dependencies: rustorePushEnabled
    ? {}
    : {
        'react-native-rustore-push': {
          platforms: {
            android: null,
            ios: null,
          },
        },
      },
};
