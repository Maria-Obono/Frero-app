"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FRIENDS_PER_USER = exports.MAX_PENDING_OUTBOUND_REQUESTS = exports.FriendServiceError = exports.FriendRepository = exports.FriendService = void 0;
var friend_service_1 = require("./friend.service");
Object.defineProperty(exports, "FriendService", { enumerable: true, get: function () { return friend_service_1.FriendService; } });
var friend_repository_1 = require("./friend.repository");
Object.defineProperty(exports, "FriendRepository", { enumerable: true, get: function () { return friend_repository_1.FriendRepository; } });
var types_1 = require("./types");
Object.defineProperty(exports, "FriendServiceError", { enumerable: true, get: function () { return types_1.FriendServiceError; } });
Object.defineProperty(exports, "MAX_PENDING_OUTBOUND_REQUESTS", { enumerable: true, get: function () { return types_1.MAX_PENDING_OUTBOUND_REQUESTS; } });
Object.defineProperty(exports, "MAX_FRIENDS_PER_USER", { enumerable: true, get: function () { return types_1.MAX_FRIENDS_PER_USER; } });
//# sourceMappingURL=index.js.map