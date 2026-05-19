"use strict";
/**
 * Real-time module entry point.
 *
 * Exports the Socket.IO server setup, authentication, room management,
 * call signaling, and live streaming services.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultStreamTimerProvider = exports.BITRATE_CONFIGS = exports.RECORDING_AVAILABILITY_MS = exports.MAX_STREAM_LATENCY_MS = exports.STREAM_START_TIMEOUT_MS = exports.StreamService = exports.defaultTimerProvider = exports.MIN_VIDEO_BITRATE_KBPS = exports.CALL_TERMINATION_TIMEOUT_MS = exports.CALL_ESTABLISHMENT_TIMEOUT_MS = exports.ICE_RENEGOTIATION_DELAY_MS = exports.MAX_ICE_RENEGOTIATION_ATTEMPTS = exports.CallService = exports.getSocketChatRooms = exports.getChatRoom = exports.getUserRoom = exports.leaveChatRoom = exports.joinChatRoom = exports.leaveUserRoom = exports.joinUserRoom = exports.verifySocketToken = exports.extractToken = exports.socketAuthMiddleware = exports.PING_TIMEOUT_MS = exports.PING_INTERVAL_MS = exports.createSocketServer = void 0;
var socket_server_1 = require("./socket-server");
Object.defineProperty(exports, "createSocketServer", { enumerable: true, get: function () { return socket_server_1.createSocketServer; } });
Object.defineProperty(exports, "PING_INTERVAL_MS", { enumerable: true, get: function () { return socket_server_1.PING_INTERVAL_MS; } });
Object.defineProperty(exports, "PING_TIMEOUT_MS", { enumerable: true, get: function () { return socket_server_1.PING_TIMEOUT_MS; } });
var socket_auth_1 = require("./socket-auth");
Object.defineProperty(exports, "socketAuthMiddleware", { enumerable: true, get: function () { return socket_auth_1.socketAuthMiddleware; } });
Object.defineProperty(exports, "extractToken", { enumerable: true, get: function () { return socket_auth_1.extractToken; } });
Object.defineProperty(exports, "verifySocketToken", { enumerable: true, get: function () { return socket_auth_1.verifySocketToken; } });
var room_manager_1 = require("./room-manager");
Object.defineProperty(exports, "joinUserRoom", { enumerable: true, get: function () { return room_manager_1.joinUserRoom; } });
Object.defineProperty(exports, "leaveUserRoom", { enumerable: true, get: function () { return room_manager_1.leaveUserRoom; } });
Object.defineProperty(exports, "joinChatRoom", { enumerable: true, get: function () { return room_manager_1.joinChatRoom; } });
Object.defineProperty(exports, "leaveChatRoom", { enumerable: true, get: function () { return room_manager_1.leaveChatRoom; } });
Object.defineProperty(exports, "getUserRoom", { enumerable: true, get: function () { return room_manager_1.getUserRoom; } });
Object.defineProperty(exports, "getChatRoom", { enumerable: true, get: function () { return room_manager_1.getChatRoom; } });
Object.defineProperty(exports, "getSocketChatRooms", { enumerable: true, get: function () { return room_manager_1.getSocketChatRooms; } });
var call_service_1 = require("./call-service");
Object.defineProperty(exports, "CallService", { enumerable: true, get: function () { return call_service_1.CallService; } });
Object.defineProperty(exports, "MAX_ICE_RENEGOTIATION_ATTEMPTS", { enumerable: true, get: function () { return call_service_1.MAX_ICE_RENEGOTIATION_ATTEMPTS; } });
Object.defineProperty(exports, "ICE_RENEGOTIATION_DELAY_MS", { enumerable: true, get: function () { return call_service_1.ICE_RENEGOTIATION_DELAY_MS; } });
Object.defineProperty(exports, "CALL_ESTABLISHMENT_TIMEOUT_MS", { enumerable: true, get: function () { return call_service_1.CALL_ESTABLISHMENT_TIMEOUT_MS; } });
Object.defineProperty(exports, "CALL_TERMINATION_TIMEOUT_MS", { enumerable: true, get: function () { return call_service_1.CALL_TERMINATION_TIMEOUT_MS; } });
Object.defineProperty(exports, "MIN_VIDEO_BITRATE_KBPS", { enumerable: true, get: function () { return call_service_1.MIN_VIDEO_BITRATE_KBPS; } });
Object.defineProperty(exports, "defaultTimerProvider", { enumerable: true, get: function () { return call_service_1.defaultTimerProvider; } });
var stream_service_1 = require("./stream-service");
Object.defineProperty(exports, "StreamService", { enumerable: true, get: function () { return stream_service_1.StreamService; } });
Object.defineProperty(exports, "STREAM_START_TIMEOUT_MS", { enumerable: true, get: function () { return stream_service_1.STREAM_START_TIMEOUT_MS; } });
Object.defineProperty(exports, "MAX_STREAM_LATENCY_MS", { enumerable: true, get: function () { return stream_service_1.MAX_STREAM_LATENCY_MS; } });
Object.defineProperty(exports, "RECORDING_AVAILABILITY_MS", { enumerable: true, get: function () { return stream_service_1.RECORDING_AVAILABILITY_MS; } });
Object.defineProperty(exports, "BITRATE_CONFIGS", { enumerable: true, get: function () { return stream_service_1.BITRATE_CONFIGS; } });
Object.defineProperty(exports, "defaultStreamTimerProvider", { enumerable: true, get: function () { return stream_service_1.defaultStreamTimerProvider; } });
//# sourceMappingURL=index.js.map