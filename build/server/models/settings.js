// Generated by CoffeeScript 1.8.0
var Any, Settings, cozydb, _;

cozydb = require('cozydb');

_ = require('lodash');

Any = function(x) {
  return x;
};

module.exports = Settings = cozydb.getModel('MailsSettings', {
  composeInHTML: {
    type: Boolean,
    "default": true
  },
  composeOnTop: {
    type: Boolean,
    "default": false
  },
  desktopNotifications: {
    type: Boolean,
    "default": false
  },
  displayConversation: {
    type: Boolean,
    "default": true
  },
  displayPreview: {
    type: Boolean,
    "default": true
  },
  layoutStyle: {
    type: String,
    "default": 'vertical'
  },
  listStyle: {
    type: String,
    "default": 'default'
  },
  messageConfirmDelete: {
    type: Boolean,
    "default": true
  },
  messageDisplayHTML: {
    type: Boolean,
    "default": true
  },
  messageDisplayImages: {
    type: Boolean,
    "default": false
  },
  plugins: {
    type: Any,
    "default": null
  }
});

Settings.getInstance = function(callback) {
  return Settings.request('all', function(err, settings) {
    var existing;
    if (err) {
      return callback(err);
    }
    existing = settings != null ? settings[0] : void 0;
    if (existing) {
      return callback(null, existing);
    } else {
      return Settings.create({}, callback);
    }
  });
};

Settings.get = function(callback) {
  return Settings.getInstance(function(err, instance) {
    return callback(err, instance != null ? instance.toObject() : void 0);
  });
};

Settings.getDefault = function(callback) {
  var settings;
  settings = {
    composeInHTML: true,
    composeOnTop: false,
    desktopNotifications: false,
    displayConversation: true,
    displayPreview: true,
    layoutStyle: 'three',
    listStyle: 'default',
    messageConfirmDelete: true,
    messageDisplayHTML: true,
    messageDisplayImages: false,
    plugins: {
      gallery: {
        name: "Gallery",
        active: true
      },
      mailkeys: {
        name: "Keyboard shortcuts",
        active: true
      },
      mediumeditor: {
        name: "Medium Editor",
        active: true
      },
      minislate: {
        name: "Slate editor",
        active: false
      },
      sample: {
        name: "Sample plugin",
        active: false
      },
      vcard: {
        name: "VCard",
        active: false
      }
    }
  };
  return callback(null, settings);
};

Settings.set = function(changes, callback) {
  return Settings.getInstance(function(err, instance) {
    if (err) {
      return callback(err);
    }
    return instance.updateAttributes(changes, callback);
  });
};
