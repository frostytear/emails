// Generated by CoffeeScript 1.9.1
var AccountConfigError, BadRequest, CONCURRENT_DESTROY, CONSTANTS, ImapPool, LIMIT_DESTROY, LIMIT_UPDATE, MSGBYPAGE, MailAdress, Mailbox, Message, NotFound, _, async, cozydb, htmlToText, log, mailutils, ref, uuid,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

cozydb = require('cozydb');

MailAdress = (function(superClass) {
  extend(MailAdress, superClass);

  function MailAdress() {
    return MailAdress.__super__.constructor.apply(this, arguments);
  }

  MailAdress.schema = {
    name: String,
    address: String
  };

  return MailAdress;

})(cozydb.Model);

module.exports = Message = (function(superClass) {
  extend(Message, superClass);

  function Message() {
    return Message.__super__.constructor.apply(this, arguments);
  }

  Message.docType = 'Message';

  Message.schema = {
    accountID: String,
    messageID: String,
    normSubject: String,
    conversationID: String,
    mailboxIDs: cozydb.NoSchema,
    hasTwin: [String],
    flags: [String],
    headers: cozydb.NoSchema,
    from: [MailAdress],
    to: [MailAdress],
    cc: [MailAdress],
    bcc: [MailAdress],
    replyTo: [MailAdress],
    subject: String,
    inReplyTo: [String],
    references: [String],
    text: String,
    html: String,
    date: Date,
    priority: String,
    ignoreInCount: Boolean,
    binary: cozydb.NoSchema,
    attachments: cozydb.NoSchema,
    alternatives: cozydb.NoSchema
  };

  Message.recoverChangedUID = function(box, messageID, newUID, callback) {
    log.debug("recoverChangedUID");
    return Message.byMessageID(box.accountID, messageID, function(err, message) {
      var mailboxIDs;
      if (err) {
        return callback(err);
      }
      if (!message) {
        return callback(null);
      }
      if (!message.mailboxIDs[box.id]) {
        return callback(null);
      }
      mailboxIDs = message.mailboxIDs;
      mailboxIDs[box.id] = newUID;
      return message.updateAttributes({
        mailboxIDs: mailboxIDs
      }, callback);
    });
  };

  Message.findMultiple = function(ids, callback) {
    return async.mapSeries(ids, function(id, cb) {
      return Message.find(id, cb);
    }, callback);
  };

  Message.pickConversationID = function(rows, callback) {
    var change, conversationID, conversationIDCounts, count, i, len, name, pickedConversationID, pickedConversationIDCount, row;
    log.debug("pickConversationID");
    conversationIDCounts = {};
    for (i = 0, len = rows.length; i < len; i++) {
      row = rows[i];
      if (conversationIDCounts[name = row.value] == null) {
        conversationIDCounts[name] = 1;
      }
      conversationIDCounts[row.value]++;
    }
    pickedConversationID = null;
    pickedConversationIDCount = 0;
    for (conversationID in conversationIDCounts) {
      count = conversationIDCounts[conversationID];
      if (count > pickedConversationIDCount) {
        pickedConversationID = conversationID;
        pickedConversationIDCount = count;
      }
    }
    if (!((pickedConversationID != null) && pickedConversationID !== 'undefined')) {
      pickedConversationID = uuid.v4();
    }
    change = {
      conversationID: pickedConversationID
    };
    return async.eachSeries(rows, function(row, cb) {
      if (row.value === pickedConversationID) {
        return cb(null);
      }
      return Message.find(row.id, function(err, message) {
        if (err) {
          log.warn("Cant get message " + row.id + ", ignoring");
        }
        if (err || message.conversationID === pickedConversationID) {
          return cb(null);
        } else {
          return message.updateAttributes(change, cb);
        }
      });
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return callback(null, pickedConversationID);
    });
  };

  Message.findConversationID = function(mail, callback) {
    var isReplyOrForward, key, keys, ref, references, subject;
    log.debug("findConversationID");
    subject = mail.subject;
    isReplyOrForward = subject && mailutils.isReplyOrForward(subject);
    references = mail.references || [];
    references.concat(mail.inReplyTo || []);
    references = references.map(mailutils.normalizeMessageID).filter(function(mid) {
      return mid;
    });
    log.debug("findConversationID", references, mail.normSubject, isReplyOrForward);
    if (references.length) {
      keys = references.map(function(mid) {
        return [mail.accountID, 'mid', mid];
      });
      return Message.rawRequest('dedupRequest', {
        keys: keys
      }, function(err, rows) {
        if (err) {
          return callback(err);
        }
        log.debug('   found = ', rows != null ? rows.length : void 0);
        return Message.pickConversationID(rows, callback);
      });
    } else if (((ref = mail.normSubject) != null ? ref.length : void 0) > 3 && isReplyOrForward) {
      key = [mail.accountID, 'subject', mail.normSubject];
      return Message.rawRequest('dedupRequest', {
        key: key
      }, function(err, rows) {
        if (err) {
          return callback(err);
        }
        log.debug("found similar", rows.length);
        return Message.pickConversationID(rows, callback);
      });
    } else {
      return callback(null, uuid.v4());
    }
  };

  Message.UIDsInRange = function(mailboxID, min, max, callback) {
    return Message.rawRequest('byMailboxRequest', {
      startkey: ['uid', mailboxID, min],
      endkey: ['uid', mailboxID, max],
      inclusive_end: true,
      reduce: false
    }, function(err, rows) {
      var i, len, result, row, uid;
      if (err) {
        return callback(err);
      }
      result = {};
      for (i = 0, len = rows.length; i < len; i++) {
        row = rows[i];
        uid = row.key[2];
        result[uid] = [row.id, row.value];
      }
      return callback(null, result);
    });
  };

  Message.indexedByUIDs = function(mailboxID, uids, callback) {
    var keys;
    keys = uids.map(function(uid) {
      return ['uid', mailboxID, parseInt(uid)];
    });
    return Message.rawRequest('byMailboxRequest', {
      reduce: false,
      keys: keys,
      include_docs: true
    }, function(err, rows) {
      var i, len, result, row, uid;
      if (err) {
        return callback(err);
      }
      result = {};
      for (i = 0, len = rows.length; i < len; i++) {
        row = rows[i];
        uid = row.key[2];
        result[uid] = new Message(row.doc);
      }
      return callback(null, result);
    });
  };

  Message.byUIDs = function(mailboxID, uids, callback) {
    var keys;
    keys = uids.map(function(uid) {
      return ['uid', mailboxID, uid];
    });
    return Message.rawRequest('byMailboxRequest', {
      reduce: false,
      keys: keys,
      include_docs: true
    }, function(err, rows) {
      var messages;
      if (err) {
        return callback(err);
      }
      messages = rows.map(function(row) {
        return new Message(row.doc);
      });
      return callback(null, messages);
    });
  };

  Message.UIDsInCozy = function(mailboxID, callback) {
    return Message.rawRequest('byMailboxRequest', {
      startkey: ['uid', mailboxID],
      endkey: ['uid', mailboxID, {}],
      reduce: true,
      group_level: 3
    }, function(err, rows) {
      var row, uids;
      if (err) {
        return callback(err);
      }
      uids = (function() {
        var i, len, results1;
        results1 = [];
        for (i = 0, len = rows.length; i < len; i++) {
          row = rows[i];
          results1.push(row.key[2]);
        }
        return results1;
      })();
      return callback(null, uids);
    });
  };

  Message.byMessageID = function(accountID, messageID, callback) {
    messageID = mailutils.normalizeMessageID(messageID);
    return Message.rawRequest('dedupRequest', {
      key: [accountID, 'mid', messageID],
      include_docs: true
    }, function(err, rows) {
      var message, ref;
      if (err) {
        return callback(err);
      }
      message = (ref = rows[0]) != null ? ref.doc : void 0;
      if (message) {
        message = new Message(message);
      }
      return callback(null, message);
    });
  };

  Message.getConversationLengths = function(conversationIDs, callback) {
    return Message.rawRequest('byConversationID', {
      keys: conversationIDs,
      group: true,
      reduce: true
    }, function(err, rows) {
      var i, len, out, row;
      if (err) {
        return callback(err);
      }
      out = {};
      for (i = 0, len = rows.length; i < len; i++) {
        row = rows[i];
        out[row.key] = row.value;
      }
      return callback(null, out);
    });
  };

  Message.byConversationID = function(conversationID, callback) {
    return Message.byConversationIDs([conversationID], callback);
  };

  Message.byConversationIDs = function(conversationIDs, callback) {
    return Message.rawRequest('byConversationID', {
      keys: conversationIDs,
      reduce: false,
      include_docs: true
    }, function(err, rows) {
      var messages;
      if (err) {
        return callback(err);
      }
      messages = rows.map(function(row) {
        try {
          return new Message(row.doc);
        } catch (_error) {
          err = _error;
          log.error("Wrong message", err, row.doc);
          return null;
        }
      });
      return callback(null, messages);
    });
  };

  Message.safeDestroyByAccountID = function(accountID, callback, retries) {
    if (retries == null) {
      retries = 2;
    }
    log.info("destroying all messages in account " + accountID);
    return Message.rawRequest('dedupRequest', {
      limit: LIMIT_DESTROY,
      startkey: [accountID],
      endkey: [accountID, {}]
    }, function(err, rows) {
      if (err) {
        return callback(err);
      }
      if (rows.length === 0) {
        return callback(null);
      }
      log.info("destroying", rows.length, "messages");
      return async.eachLimit(rows, CONCURRENT_DESTROY, function(row, cb) {
        return new Message({
          id: row.id
        }).destroy(function(err) {
          if ((err != null ? err.message : void 0) === "Document not found") {
            return cb(null);
          } else {
            return cb(err);
          }
        });
      }, function(err) {
        if (err && retries > 0) {
          log.warn("DS has crashed ? waiting 4s before try again", err);
          return setTimeout(function() {
            return Message.safeDestroyByAccountID(accountID, callback, retries - 1);
          }, 4000);
        } else if (err) {
          return callback(err);
        } else {
          return Message.safeDestroyByAccountID(accountID, callback, 2);
        }
      });
    });
  };

  Message.safeRemoveAllFromBox = function(mailboxID, callback, retries) {
    if (retries == null) {
      retries = 2;
    }
    log.info("removing all messages from mailbox " + mailboxID);
    return Message.rawRequest('byMailboxRequest', {
      limit: LIMIT_UPDATE,
      startkey: ['uid', mailboxID, 0],
      endkey: ['uid', mailboxID, {}],
      include_docs: true,
      reduce: false
    }, function(err, rows) {
      if (err) {
        return callback(err);
      }
      if (rows.length === 0) {
        return callback(null);
      }
      return async.eachLimit(rows, CONCURRENT_DESTROY, function(row, cb) {
        return new Message(row.doc).removeFromMailbox({
          id: mailboxID
        }, true, cb);
      }, function(err) {
        if (err && retries > 0) {
          log.warn("DS has crashed ? waiting 4s before try again", err);
          return setTimeout(function() {
            return Message.safeRemoveAllFromBox(mailboxID, callback, retries - 1);
          }, 4000);
        } else if (err) {
          return callback(err);
        } else {
          return Message.safeRemoveAllFromBox(mailboxID, callback, 2);
        }
      });
    });
  };

  Message.removeFromMailbox = function(id, box, callback) {
    log.debug("removeFromMailbox", id, box.label);
    return Message.find(id, function(err, message) {
      if (err) {
        return callback(err);
      }
      if (!message) {
        return callback(new NotFound("Message " + id));
      }
      return message.removeFromMailbox(box, false, callback);
    });
  };

  Message.applyFlagsChanges = function(id, flags, callback) {
    log.debug("applyFlagsChanges", id, flags);
    return Message.updateAttributes(id, {
      flags: flags
    }, callback);
  };

  Message.removeOrphans = function(existings, callback) {
    log.debug("removeOrphans");
    return Message.rawRequest('byMailboxRequest', {
      reduce: true,
      group_level: 2,
      startkey: ['uid', ''],
      endkey: ['uid', "\uFFFF"]
    }, function(err, rows) {
      if (err) {
        return callback(err);
      }
      return async.eachSeries(rows, function(row, cb) {
        var mailboxID;
        mailboxID = row.key[1];
        if (indexOf.call(existings, mailboxID) >= 0) {
          return cb(null);
        } else {
          log.debug("removeOrphans - found orphan", row.id);
          return Message.safeRemoveAllFromBox(mailboxID, function(err) {
            if (err) {
              log.error("failed to remove message", row.id, err);
            }
            return cb(null);
          });
        }
      }, function(err) {
        var options;
        options = {
          key: ['nobox'],
          reduce: false
        };
        return Message.rawRequest('byMailboxRequest', options, function(err, rows) {
          if (err) {
            return callback(err);
          }
          return async.eachSeries(rows, function(row, cb) {
            return Message.destroy(row.id, function(err) {
              if (err) {
                log.error('fail to destroy orphan', err);
              }
              return cb(null);
            });
          }, callback);
        });
      });
    });
  };

  Message.getResultsAndCount = function(mailboxID, params, callback) {
    var ref;
    if (params.flag == null) {
      params.flag = null;
    }
    if (params.descending) {
      ref = [params.after, params.before], params.before = ref[0], params.after = ref[1];
    }
    return async.series([
      function(cb) {
        return Message.getCount(mailboxID, params, cb);
      }, function(cb) {
        return Message.getResults(mailboxID, params, cb);
      }
    ], function(err, results) {
      var conversationIDs, count, messages;
      if (err) {
        return callback(err);
      }
      count = results[0], messages = results[1];
      conversationIDs = _.uniq(_.pluck(messages, 'conversationID'));
      return Message.getConversationLengths(conversationIDs, function(err, lengths) {
        if (err) {
          return callback(err);
        }
        return callback(null, {
          messages: messages,
          count: count,
          conversationLengths: lengths
        });
      });
    });
  };

  Message.getResults = function(mailboxID, params, callback) {
    var after, before, descending, endkey, flag, requestOptions, skip, sortField, startkey;
    before = params.before, after = params.after, descending = params.descending, sortField = params.sortField, flag = params.flag;
    skip = 0;
    if (sortField === 'from' || sortField === 'dest') {
      if (params.resultsAfter != null) {
        skip = params.resultsAfter;
      }
      startkey = [sortField, mailboxID, flag, before, null];
      endkey = [sortField, mailboxID, flag, after, null];
    } else {
      if (params.resultsAfter != null) {
        startkey = [sortField, mailboxID, flag, params.resultsAfter];
      } else {
        startkey = [sortField, mailboxID, flag, before];
      }
      endkey = [sortField, mailboxID, flag, after];
    }
    requestOptions = {
      descending: descending,
      startkey: startkey,
      endkey: endkey,
      reduce: false,
      skip: skip,
      include_docs: true,
      limit: MSGBYPAGE
    };
    return Message.rawRequest('byMailboxRequest', requestOptions, function(err, rows) {
      if (err) {
        return callback(err);
      }
      return callback(null, rows.map(function(row) {
        return new Message(row.doc);
      }));
    });
  };

  Message.getCount = function(mailboxID, params, callback) {
    var after, before, descending, flag, sortField;
    before = params.before, after = params.after, descending = params.descending, sortField = params.sortField, flag = params.flag;
    return Message.rawRequest('byMailboxRequest', {
      descending: descending,
      startkey: [sortField, mailboxID, flag, before],
      endkey: [sortField, mailboxID, flag, after],
      reduce: true,
      group_level: 2
    }, function(err, rows) {
      var ref;
      if (err) {
        return callback(err);
      }
      return callback(null, ((ref = rows[0]) != null ? ref.value : void 0) || 0);
    });
  };

  Message.updateOrCreate = function(message, callback) {
    log.debug("create or update");
    if (message.id) {
      return Message.find(message.id, function(err, existing) {
        log.debug("update");
        if (err) {
          return callback(err);
        } else if (!existing) {
          return callback(new NotFound("Message " + message.id));
        } else {
          message.binary = existing.binary;
          return existing.updateAttributes(message, callback);
        }
      });
    } else {
      log.debug("create");
      return Message.create(message, callback);
    }
  };

  Message.fetchOrUpdate = function(box, msg, callback) {
    var mid, uid;
    mid = msg.mid, uid = msg.uid;
    log.debug("fetchOrUpdate", box.id, mid, uid);
    return Message.byMessageID(box.accountID, mid, function(err, existing) {
      if (err) {
        return callback(err);
      }
      if (existing && !existing.isInMailbox(box)) {
        log.debug("        add");
        return existing.addToMailbox(box, uid, callback);
      } else if (existing) {
        log.debug("        twin");
        return existing.markTwin(box, callback);
      } else {
        log.debug("        fetch");
        return box.imap_fetchOneMail(uid, callback);
      }
    });
  };

  Message.prototype.markTwin = function(box, callback) {
    var hasTwin, ref;
    hasTwin = this.hasTwin || [];
    if (ref = box.id, indexOf.call(hasTwin, ref) >= 0) {
      return callback(null, {
        shouldNotif: false,
        actuallyAdded: false
      });
    } else {
      hasTwin.push(box.id);
      return this.updateAttributes({
        hasTwin: hasTwin
      }, function(err) {
        return callback(err, {
          shouldNotif: false,
          actuallyAdded: true
        });
      });
    }
  };

  Message.prototype.addToMailbox = function(box, uid, callback) {
    var changes, key, mailboxIDs, ref, value;
    log.info("MAIL " + box.path + ":" + uid + " ADDED TO BOX");
    mailboxIDs = {};
    ref = this.mailboxIDs || {};
    for (key in ref) {
      value = ref[key];
      mailboxIDs[key] = value;
    }
    mailboxIDs[box.id] = uid;
    changes = {
      mailboxIDs: mailboxIDs
    };
    if (box.ignoreInCount()) {
      changes.ignoreInCount = true;
    }
    return this.updateAttributes(changes, function(err) {
      return callback(err, {
        shouldNotif: false,
        actuallyAdded: true
      });
    });
  };

  Message.prototype.isInMailbox = function(box) {
    return (this.mailboxIDs[box.id] != null) && this.mailboxIDs[box.id] !== -1;
  };

  Message.prototype.removeFromMailbox = function(box, noDestroy, callback) {
    var isOrphan, key, mailboxIDs, ref, value;
    if (noDestroy == null) {
      noDestroy = false;
    }
    log.debug(".removeFromMailbox", this.id, box.label);
    if (!callback) {
      callback = noDestroy;
    }
    mailboxIDs = {};
    ref = this.mailboxIDs || {};
    for (key in ref) {
      value = ref[key];
      mailboxIDs[key] = value;
    }
    delete mailboxIDs[box.id];
    isOrphan = Object.keys(mailboxIDs).length === 0;
    log.debug("REMOVING " + this.id + ", NOW ORPHAN = ", isOrphan);
    if (isOrphan && !noDestroy) {
      return this.destroy(callback);
    } else {
      return this.updateAttributes({
        mailboxIDs: mailboxIDs
      }, callback);
    }
  };

  Message.createFromImapMessage = function(mail, box, uid, callback) {
    var attachments, messageID;
    log.info("createFromImapMessage", box.label, uid);
    log.debug('flags = ', mail.flags);
    mail.accountID = box.accountID;
    mail.ignoreInCount = box.ignoreInCount();
    mail.mailboxIDs = {};
    mail.mailboxIDs[box._id] = uid;
    messageID = mail.headers['message-id'];
    delete mail.messageId;
    if (messageID && messageID instanceof Array) {
      messageID = messageID[0];
    }
    if (messageID) {
      mail.messageID = mailutils.normalizeMessageID(messageID);
    }
    if (mail.subject) {
      mail.normSubject = mailutils.normalizeSubject(mail.subject);
    }
    if (mail.replyTo == null) {
      mail.replyTo = [];
    }
    if (mail.cc == null) {
      mail.cc = [];
    }
    if (mail.bcc == null) {
      mail.bcc = [];
    }
    if (mail.to == null) {
      mail.to = [];
    }
    if (mail.from == null) {
      mail.from = [];
    }
    if (mail.date == null) {
      mail.date = new Date().toISOString();
    }
    attachments = [];
    if (mail.attachments) {
      attachments = mail.attachments.map(function(att) {
        var buffer, out;
        buffer = att.content;
        delete att.content;
        return out = {
          name: att.generatedFileName,
          buffer: buffer
        };
      });
    }
    return Message.findConversationID(mail, function(err, conversationID) {
      if (err) {
        return callback(err);
      }
      mail.conversationID = conversationID;
      return Message.create(mail, function(err, jdbMessage) {
        if (err) {
          return callback(err);
        }
        return jdbMessage.storeAttachments(attachments, callback);
      });
    });
  };

  Message.prototype.storeAttachments = function(attachments, callback) {
    log.debug("storeAttachments");
    return async.eachSeries(attachments, (function(_this) {
      return function(att, cb) {
        if (att.buffer == null) {
          att.buffer = new Buffer(0);
        }
        att.buffer.path = encodeURI(att.name);
        return _this.attachBinary(att.buffer, {
          name: att.name
        }, cb);
      };
    })(this), callback);
  };

  Message.prototype.toClientObject = function() {
    var attachments, raw, ref;
    raw = this.toObject();
    if ((ref = raw.attachments) != null) {
      ref.forEach(function(file) {
        var encodedFileName;
        encodedFileName = encodeURIComponent(file.generatedFileName);
        return file.url = "message/" + raw.id + "/attachments/" + encodedFileName;
      });
    }
    if (raw.html != null) {
      attachments = raw.attachments || [];
      raw.html = mailutils.sanitizeHTML(raw.html, raw.id, attachments);
    }
    if ((raw.text == null) && (raw.html != null)) {
      raw.text = htmlToText.fromString(raw.html, {
        tables: true,
        wordwrap: 80
      });
    }
    return raw;
  };

  Message.groupWithBox = function(messages, callback) {
    var accountID;
    accountID = messages[0].accountID;
    return Mailbox.getBoxesIndexedByID(accountID, function(err, boxIndex) {
      var boxID, i, len, message, messagesIndex, ref, uid;
      if (err) {
        return callback(err);
      }
      messagesIndex = {};
      for (i = 0, len = messages.length; i < len; i++) {
        message = messages[i];
        ref = message.mailboxIDs;
        for (boxID in ref) {
          uid = ref[boxID];
          if (messagesIndex[boxID] == null) {
            messagesIndex[boxID] = [];
          }
          messagesIndex[boxID].push(message);
        }
      }
      return callback(null, {
        boxIndex: boxIndex,
        messagesIndex: messagesIndex
      });
    });
  };

  Message.doGroupedByBox = function(messages, iterator, done) {
    var accountID;
    if (messages.length === 0) {
      return done(null);
    }
    accountID = messages[0].accountID;
    return Message.groupWithBox(messages, function(err, arg) {
      var boxIndex, messagesIndex, state;
      boxIndex = arg.boxIndex, messagesIndex = arg.messagesIndex;
      if (err) {
        return done(err);
      }
      state = {
        boxIndex: boxIndex
      };
      return async.eachSeries(Object.keys(messagesIndex), function(boxID, next) {
        var iterator2, pool;
        state.box = boxIndex[boxID];
        state.messagesInBox = messagesIndex[boxID];
        iterator2 = function(imap, imapBox, releaseImap) {
          state.imapBox = imapBox;
          state.uids = state.messagesInBox.map(function(msg) {
            return msg.mailboxIDs[state.box.id];
          });
          return iterator(imap, state, releaseImap);
        };
        pool = ImapPool.get(accountID);
        return pool.doASAPWithBox(state.box, iterator2, next);
      }, done);
    });
  };

  Message.batchAddFlag = function(messages, flag, callback) {
    messages = messages.filter(function(msg) {
      return indexOf.call(msg.flags, flag) < 0;
    });
    return Message.doGroupedByBox(messages, function(imap, state, next) {
      return imap.addFlags(state.uids, flag, next);
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return async.mapSeries(messages, function(message, next) {
        var newflags;
        newflags = message.flags.concat(flag);
        return message.updateAttributes({
          flags: newflags
        }, function(err) {
          return next(err, message);
        });
      }, callback);
    });
  };

  Message.batchRemoveFlag = function(messages, flag, callback) {
    messages = messages.filter(function(msg) {
      return indexOf.call(msg.flags, flag) >= 0;
    });
    return Message.doGroupedByBox(messages, function(imap, state, next) {
      return imap.delFlags(state.uids, flag, next);
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return async.mapSeries(messages, function(message, next) {
        var newflags;
        newflags = _.without(message.flags, flag);
        return message.updateAttributes({
          flags: newflags
        }, function(err) {
          return next(err, message);
        });
      }, callback);
    });
  };

  Message.batchMove = function(messages, from, to, callback) {
    var alreadyMoved, changes, destBoxes, fromBox, ignores;
    if (!Array.isArray(to)) {
      to = [to];
    }
    messages = messages.filter(function(msg) {
      var boxes;
      boxes = Object.keys(msg.mailboxIDs);
      return _.xor(boxes, to).length > 1;
    });
    fromBox = null;
    destBoxes = null;
    alreadyMoved = [];
    changes = {};
    ignores = null;
    log.debug("batchMove", messages.length, from, to);
    return Message.doGroupedByBox(messages, function(imap, state, nextBox) {
      var box, boxid, currentBox, destBox, destString, expunges, i, id, j, len, len1, message, moves, mustRemove, paths, ref, ref1, uid;
      if (fromBox == null) {
        fromBox = state.boxIndex[from];
      }
      if (destBoxes == null) {
        destBoxes = to.map(function(id) {
          return state.boxIndex[id];
        });
      }
      currentBox = state.box;
      if (!ignores) {
        ignores = {};
        ref = state.boxIndex;
        for (boxid in ref) {
          box = ref[boxid];
          if (box.ignoreInCount()) {
            ignores[id] = true;
          }
        }
      }
      destString = to.join(',');
      if (indexOf.call(destBoxes, void 0) >= 0) {
        return nextBox(new Error("One of destination boxes " + destString + " doesnt exist"));
      }
      if (indexOf.call(destBoxes, currentBox) >= 0) {
        return nextBox(null);
      }
      mustRemove = currentBox === fromBox || !from;
      moves = [];
      expunges = [];
      ref1 = state.messagesInBox;
      for (i = 0, len = ref1.length; i < len; i++) {
        message = ref1[i];
        id = message.id;
        uid = message.mailboxIDs[currentBox.id];
        if (message.mailboxIDs[to] || indexOf.call(alreadyMoved, id) >= 0) {
          if (mustRemove) {
            expunges.push(uid);
            if (changes[id] == null) {
              changes[id] = message.cloneMailboxIDs();
            }
            delete changes[id][currentBox.id];
          }
        } else if (message.isDraft() && from === null) {
          expunges.push(uid);
          if (changes[id] == null) {
            changes[id] = message.cloneMailboxIDs();
          }
          delete changes[id][currentBox.id];
        } else {
          moves.push(uid);
          alreadyMoved.push(id);
          if (changes[id] == null) {
            changes[id] = message.cloneMailboxIDs();
          }
          delete changes[id][currentBox.id];
          for (j = 0, len1 = destBoxes.length; j < len1; j++) {
            destBox = destBoxes[j];
            changes[id][destBox.id] = -1;
          }
        }
      }
      log.debug("MOVING", moves, "FROM", currentBox.id, "TO", destString);
      log.debug("EXPUNGING", expunges, "FROM", currentBox.id);
      paths = destBoxes.map(function(box) {
        return box.path;
      });
      return imap.multimove(moves, paths, function(err, result) {
        if (err) {
          return nextBox(err);
        }
        return imap.multiexpunge(expunges, function(err) {
          if (err) {
            return nextBox(err);
          }
          return nextBox(null);
        });
      });
    }, function(err) {
      if (err) {
        return callback(err);
      }
      return async.mapSeries(messages, function(message, next) {
        var data, newMailboxIDs;
        newMailboxIDs = changes[message.id];
        if (!newMailboxIDs) {
          return next(null, message);
        } else {
          data = {
            mailboxIDs: newMailboxIDs,
            ignoreInCount: Object.keys(newMailboxIDs).some(function(id) {
              return ignores[id];
            })
          };
          return message.updateAttributes(data, function(err) {
            return next(err, message);
          });
        }
      }, function(err, updated) {
        var limit;
        if (err) {
          return callback(err);
        }
        if (updated.length === 0) {
          return callback(null, []);
        }
        limit = Math.max(100, messages.length * 2);
        return async.eachSeries(destBoxes, function(destBox, cb) {
          return destBox.imap_refresh({
            limitByBox: limit
          }, cb);
        }, function(err) {
          if (err) {
            return callback(err);
          }
          return callback(null, updated);
        });
      });
    });
  };

  Message.batchTrash = function(messages, trashBoxID, callback) {
    return this.batchMove(messages, null, trashBoxID, callback);
  };

  Message.prototype.cloneMailboxIDs = function() {
    var boxID, out, ref, uid;
    out = {};
    ref = this.mailboxIDs;
    for (boxID in ref) {
      uid = ref[boxID];
      out[boxID] = uid;
    }
    return out;
  };

  Message.prototype.isDraft = function(draftBoxID) {
    return (this.mailboxIDs[draftBoxID] != null) || indexOf.call(this.flags, '\\Draft') >= 0;
  };

  Message.prototype.doASAP = function(operation, callback) {
    return ImapPool.get(this.accountID).doASAP(operation, callback);
  };

  return Message;

})(cozydb.CozyModel);

module.exports = Message;

mailutils = require('../utils/jwz_tools');

CONSTANTS = require('../utils/constants');

MSGBYPAGE = CONSTANTS.MSGBYPAGE, LIMIT_DESTROY = CONSTANTS.LIMIT_DESTROY, LIMIT_UPDATE = CONSTANTS.LIMIT_UPDATE, CONCURRENT_DESTROY = CONSTANTS.CONCURRENT_DESTROY;

ref = require('../utils/errors'), NotFound = ref.NotFound, BadRequest = ref.BadRequest, AccountConfigError = ref.AccountConfigError;

uuid = require('uuid');

_ = require('lodash');

async = require('async');

log = require('../utils/logging')({
  prefix: 'models:message'
});

Mailbox = require('./mailbox');

ImapPool = require('../imap/pool');

htmlToText = require('html-to-text');

require('../utils/socket_handler').wrapModel(Message, 'message');
