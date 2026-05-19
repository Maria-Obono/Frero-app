"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../config");
exports.logger = winston_1.default.createLogger({
    level: config_1.config.nodeEnv === 'production' ? 'info' : 'debug',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), config_1.config.nodeEnv === 'production' ? winston_1.default.format.json() : winston_1.default.format.simple()),
    defaultMeta: { service: 'frero-api' },
    transports: [new winston_1.default.transports.Console()],
});
//# sourceMappingURL=logger.js.map